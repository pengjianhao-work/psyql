from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from transformers import AutoTokenizer, AutoModelForCausalLM
import torch
from typing import Optional

app = FastAPI(title="心理问答LLM服务", description="基于Qwen-7B的心理问答模型")

MODEL_NAME = "Qwen/Qwen-7B-Chat"
tokenizer = None
model = None

class QuestionRequest(BaseModel):
    question: str
    description: Optional[str] = None
    max_length: Optional[int] = 512
    temperature: Optional[float] = 0.7

class AnswerResponse(BaseModel):
    answer: str
    model: str = MODEL_NAME

def load_model():
    global tokenizer, model
    print(f"正在加载模型: {MODEL_NAME}")
    tokenizer = AutoTokenizer.from_pretrained(
        MODEL_NAME,
        cache_dir="./models",
        trust_remote_code=True
    )
    model = AutoModelForCausalLM.from_pretrained(
        MODEL_NAME,
        cache_dir="./models",
        trust_remote_code=True,
        torch_dtype=torch.float16,
        low_cpu_mem_usage=True,
        device_map="auto"
    )
    model.eval()
    print("模型加载完成！")

@app.on_event("startup")
async def startup_event():
    load_model()

@app.post("/api/chat", response_model=AnswerResponse)
async def chat(request: QuestionRequest):
    try:
        context = f"用户问：{request.question}"
        if request.description:
            context += f"\n描述：{request.description}"
        
        prompt = f"""
您是一位专业的心理咨询师，请根据用户的问题提供温暖、专业、有帮助的回答。

用户问题：
{context}

请给出详细、专业的心理建议：
"""
        
        inputs = tokenizer(prompt, return_tensors="pt").to(model.device)
        
        with torch.no_grad():
            outputs = model.generate(
                **inputs,
                max_length=request.max_length,
                temperature=request.temperature,
                do_sample=True,
                top_p=0.9,
                repetition_penalty=1.1,
                eos_token_id=tokenizer.eos_token_id
            )
        
        answer = tokenizer.decode(outputs[0], skip_special_tokens=True)
        answer = answer.replace(prompt, "").strip()
        
        if not answer:
            answer = "我理解您的感受，面对这样的问题确实不容易。建议您：\n1. 先接纳自己的情绪\n2. 尝试与信任的人沟通\n3. 如果需要，可以寻求专业心理咨询师的帮助"
        
        return {"answer": answer}
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/health")
async def health_check():
    return {"status": "healthy", "model": MODEL_NAME if model else "not loaded"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)