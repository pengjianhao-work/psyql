from transformers import AutoTokenizer, AutoModelForCausalLM
import torch

model_name = "Qwen/Qwen-7B-Chat"

print(f"正在下载模型: {model_name}")
print("这可能需要一些时间，请耐心等待...")

tokenizer = AutoTokenizer.from_pretrained(
    model_name,
    cache_dir="./models",
    trust_remote_code=True
)

model = AutoModelForCausalLM.from_pretrained(
    model_name,
    cache_dir="./models",
    trust_remote_code=True,
    torch_dtype=torch.float16,
    low_cpu_mem_usage=True
)

print("模型下载完成！")
print(f"Tokenizer 保存路径: ./models/{model_name}")
print(f"Model 保存路径: ./models/{model_name}")