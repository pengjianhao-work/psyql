#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
QLoRA + PEFT 微调心理咨询对话模型（GPU 推荐）。

依赖: pip install -r scripts/requirements-lora.txt

用法:
  python scripts/export_lora_dataset.py
  python scripts/train_lora.py --model Qwen/Qwen2.5-1.5B-Instruct
  python scripts/train_lora.py --cpu   # 小模型 CPU 调试
"""

from __future__ import annotations

import argparse
from pathlib import Path

import torch
from datasets import load_dataset
from peft import LoraConfig, PeftModel, get_peft_model
from transformers import (
    AutoModelForCausalLM,
    AutoTokenizer,
    BitsAndBytesConfig,
    DataCollatorForSeq2Seq,
    Trainer,
    TrainingArguments,
    set_seed,
)

SCRIPT_DIR = Path(__file__).resolve().parent
REPO_ROOT = SCRIPT_DIR.parent
DEFAULT_TRAIN = REPO_ROOT / "training_data" / "lora" / "train.json"
DEFAULT_VAL = REPO_ROOT / "training_data" / "lora" / "val.json"
DEFAULT_OUT = REPO_ROOT / "training_data" / "lora" / "checkpoints"
DEFAULT_MERGED = REPO_ROOT / "training_data" / "lora" / "merged"

INSTRUCTION_DEFAULT = (
    "你是专业的大学生心理陪伴 AI。请根据用户问题给出温暖、共情、可操作的建议，"
    "不做医疗诊断，不替代线下咨询。"
)


def format_example(example: dict, tokenizer, max_length: int = 512) -> dict:
    instruction = example.get("instruction") or INSTRUCTION_DEFAULT
    input_text = example.get("input", "")
    output_text = example.get("output", "")

    prompt = f"### Instruction:\n{instruction}\n\n### Input:\n{input_text}\n\n### Response:\n"
    full_text = prompt + output_text

    tokenized = tokenizer(
        full_text,
        truncation=True,
        max_length=max_length,
        padding="max_length",
        return_overflowing_tokens=False,
    )
    tokenized["labels"] = tokenized["input_ids"].copy()
    prompt_len = len(tokenizer(prompt, truncation=True, max_length=max_length)["input_ids"])
    tokenized["labels"][:prompt_len] = [-100] * prompt_len
    return tokenized


def merge_lora_weights(base_model_path: str, lora_path: Path, output_path: Path) -> None:
    print(f"[merge] {lora_path} -> {output_path}")
    base_model = AutoModelForCausalLM.from_pretrained(
        base_model_path,
        torch_dtype=torch.bfloat16 if torch.cuda.is_available() else torch.float32,
        device_map="auto" if torch.cuda.is_available() else None,
        trust_remote_code=True,
    )
    lora_model = PeftModel.from_pretrained(base_model, str(lora_path))
    merged = lora_model.merge_and_unload()
    output_path.mkdir(parents=True, exist_ok=True)
    merged.save_pretrained(str(output_path))
    tokenizer = AutoTokenizer.from_pretrained(base_model_path, trust_remote_code=True)
    tokenizer.save_pretrained(str(output_path))
    write_ollama_modelfile(output_path)
    print(f"[OK] 合并模型: {output_path}")


def write_ollama_modelfile(merged_dir: Path) -> None:
    template = REPO_ROOT / "scripts" / "ollama" / "Modelfile.psyqa-counsel"
    if not template.exists():
        return
    content = template.read_text(encoding="utf-8").replace("{{MERGED_MODEL_PATH}}", str(merged_dir).replace("\\", "/"))
    (merged_dir / "Modelfile").write_text(content, encoding="utf-8")
    print(f"[OK] Modelfile -> {merged_dir / 'Modelfile'}")
    print("  导入 Ollama: npm run import:lora-ollama")


def main() -> int:
    parser = argparse.ArgumentParser(description="QLoRA/PEFT 心理对话微调")
    parser.add_argument("--model", default="Qwen/Qwen2.5-1.5B-Instruct")
    parser.add_argument("--train", type=Path, default=DEFAULT_TRAIN)
    parser.add_argument("--val", type=Path, default=DEFAULT_VAL)
    parser.add_argument("--output-dir", type=Path, default=DEFAULT_OUT)
    parser.add_argument("--merged-dir", type=Path, default=DEFAULT_MERGED)
    parser.add_argument("--epochs", type=int, default=3)
    parser.add_argument("--batch-size", type=int, default=2)
    parser.add_argument("--lr", type=float, default=2e-4)
    parser.add_argument("--max-length", type=int, default=512)
    parser.add_argument("--lora-r", type=int, default=32)
    parser.add_argument("--lora-alpha", type=int, default=64)
    parser.add_argument("--cpu", action="store_true", help="CPU 小模型调试（禁用 4bit）")
    parser.add_argument("--no-merge", action="store_true")
    parser.add_argument("--max-train", type=int, default=None)
    args = parser.parse_args()

    if not args.train.exists():
        print(f"[ERR] 训练集不存在: {args.train}")
        print("  请先运行: python scripts/export_lora_dataset.py")
        return 1

    set_seed(42)
    use_cuda = torch.cuda.is_available() and not args.cpu
    print(f"设备: {'CUDA' if use_cuda else 'CPU'} | 基座: {args.model}")

    tokenizer = AutoTokenizer.from_pretrained(args.model, trust_remote_code=True)
    if tokenizer.pad_token is None:
        tokenizer.pad_token = tokenizer.eos_token

    if use_cuda:
        bnb = BitsAndBytesConfig(
            load_in_4bit=True,
            bnb_4bit_use_double_quant=True,
            bnb_4bit_quant_type="nf4",
            bnb_4bit_compute_dtype=torch.bfloat16,
        )
        model = AutoModelForCausalLM.from_pretrained(
            args.model,
            quantization_config=bnb,
            torch_dtype=torch.bfloat16,
            device_map="auto",
            trust_remote_code=True,
        )
        target_modules = ["q_proj", "k_proj", "v_proj", "o_proj", "gate_proj", "up_proj", "down_proj"]
    else:
        model = AutoModelForCausalLM.from_pretrained(
            args.model,
            torch_dtype=torch.float32,
            low_cpu_mem_usage=True,
            trust_remote_code=True,
        )
        target_modules = ["q_proj", "k_proj", "v_proj", "o_proj"]

    lora_config = LoraConfig(
        r=args.lora_r,
        lora_alpha=args.lora_alpha,
        target_modules=target_modules,
        lora_dropout=0.05,
        bias="none",
        task_type="CAUSAL_LM",
    )
    model = get_peft_model(model, lora_config)
    model.print_trainable_parameters()

    train_ds = load_dataset("json", data_files=str(args.train))["train"]
    val_ds = load_dataset("json", data_files=str(args.val))["train"] if args.val.exists() else None
    if args.max_train:
        train_ds = train_ds.select(range(min(args.max_train, len(train_ds))))

    cols = train_ds.column_names
    train_ds = train_ds.map(lambda x: format_example(x, tokenizer, args.max_length), remove_columns=cols)
    if val_ds is not None:
        val_cols = val_ds.column_names
        val_ds = val_ds.map(lambda x: format_example(x, tokenizer, args.max_length), remove_columns=val_cols)

    training_args = TrainingArguments(
        output_dir=str(args.output_dir),
        per_device_train_batch_size=args.batch_size,
        per_device_eval_batch_size=args.batch_size,
        gradient_accumulation_steps=4 if use_cuda else 2,
        learning_rate=args.lr,
        num_train_epochs=args.epochs,
        warmup_ratio=0.05,
        logging_steps=10,
        evaluation_strategy="epoch" if val_ds is not None else "no",
        save_strategy="epoch",
        bf16=use_cuda,
        fp16=False,
        optim="paged_adamw_8bit" if use_cuda else "adamw_torch",
        gradient_checkpointing=use_cuda,
        report_to="none",
        load_best_model_at_end=val_ds is not None,
    )

    trainer = Trainer(
        model=model,
        args=training_args,
        train_dataset=train_ds,
        eval_dataset=val_ds,
        data_collator=DataCollatorForSeq2Seq(tokenizer, model=model, padding=True, return_tensors="pt"),
    )

    print("[train] 开始 QLoRA/PEFT 微调…")
    trainer.train()
    args.output_dir.mkdir(parents=True, exist_ok=True)
    model.save_pretrained(str(args.output_dir))
    print(f"[OK] LoRA 适配器: {args.output_dir}")

    if not args.no_merge and use_cuda:
        merge_lora_weights(args.model, args.output_dir, args.merged_dir)
        print("\n部署 Ollama 示例:")
        print(f"  1. 将 {args.merged_dir} 导入 Ollama Modelfile")
        print("  2. .env 设置 OLLAMA_MODEL=psyqa-counsel  PSYQA_LLM_PROVIDER=ollama")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
