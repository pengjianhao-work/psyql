import os
import torch
from datasets import load_dataset
from transformers import (
    AutoTokenizer,
    AutoModelForCausalLM,
    TrainingArguments,
    Trainer,
    DataCollatorForSeq2Seq,
    set_seed
)
from peft import (
    LoraConfig,
    get_peft_model,
    PeftModel,
    PeftConfig
)

def load_and_preprocess_data(train_path, val_path):
    train_dataset = load_dataset('json', data_files=train_path)['train']
    val_dataset = load_dataset('json', data_files=val_path)['train']
    return train_dataset, val_dataset

def format_example(example, tokenizer, max_length=256):
    instruction = example['instruction']
    input_text = example['input']
    output_text = example['output']
    
    prompt = f"### Instruction:\n{instruction}\n\n### Input:\n{input_text}\n\n### Response:\n"
    full_text = prompt + output_text
    
    tokenized = tokenizer(
        full_text,
        truncation=True,
        max_length=max_length,
        padding="max_length",
        return_overflowing_tokens=False
    )
    
    tokenized["labels"] = tokenized["input_ids"].copy()
    prompt_length = len(tokenizer(prompt, truncation=True, max_length=max_length)["input_ids"])
    tokenized["labels"][:prompt_length] = -100
    
    return tokenized

def main():
    set_seed(42)
    
    model_name = "gpt2"
    train_path = "d:/PsyQA1/data/train.json"
    val_path = "d:/PsyQA1/data/val.json"
    output_dir = "./lora_output_cpu"
    
    print(f"加载模型: {model_name}")
    tokenizer = AutoTokenizer.from_pretrained(model_name)
    tokenizer.pad_token = tokenizer.eos_token
    
    model = AutoModelForCausalLM.from_pretrained(
        model_name,
        torch_dtype=torch.float32,
        low_cpu_mem_usage=True
    )
    
    lora_config = LoraConfig(
        r=4,
        lora_alpha=16,
        target_modules=["c_attn"],
        lora_dropout=0.05,
        bias="none",
        task_type="CAUSAL_LM"
    )
    
    model = get_peft_model(model, lora_config)
    model.print_trainable_parameters()
    
    print("加载数据集...")
    train_dataset, val_dataset = load_and_preprocess_data(train_path, val_path)
    
    train_dataset = train_dataset.select(range(1000))
    val_dataset = val_dataset.select(range(200))
    
    train_dataset = train_dataset.map(
        lambda x: format_example(x, tokenizer),
        remove_columns=["instruction", "input", "output"]
    )
    
    val_dataset = val_dataset.map(
        lambda x: format_example(x, tokenizer),
        remove_columns=["instruction", "input", "output"]
    )
    
    training_args = TrainingArguments(
        output_dir=output_dir,
        per_device_train_batch_size=2,
        per_device_eval_batch_size=2,
        gradient_accumulation_steps=2,
        learning_rate=5e-4,
        num_train_epochs=2,
        logging_steps=5,
        evaluation_strategy="epoch",
        save_strategy="epoch",
        fp16=False,
        optim="adamw_torch",
        report_to="none",
        load_best_model_at_end=True,
        max_grad_norm=1.0
    )
    
    data_collator = DataCollatorForSeq2Seq(
        tokenizer,
        model=model,
        padding=True,
        return_tensors="pt"
    )
    
    trainer = Trainer(
        model=model,
        args=training_args,
        train_dataset=train_dataset,
        eval_dataset=val_dataset,
        data_collator=data_collator
    )
    
    print("开始训练...")
    trainer.train()
    
    model.save_pretrained(output_dir)
    print(f"训练完成！模型保存至: {output_dir}")

if __name__ == "__main__":
    main()