import json
import random
from sklearn.model_selection import train_test_split

def load_psyqa_data(file_path):
    with open(file_path, 'r', encoding='utf-8') as f:
        return json.load(f)

def format_training_sample(item):
    question = item['question']
    description = item.get('description', '')
    answers = [ans['answer_text'] for ans in item['answers']]
    
    context = f"问题：{question}"
    if description:
        context += f"\n描述：{description}"
    
    answer = "\n\n".join(answers)
    
    return {
        "instruction": "根据用户的心理问题和描述，给出专业、温和、有帮助的心理建议和回答。",
        "input": context,
        "output": answer
    }

def main():
    data_path = 'd:/PsyQA1/PsyQA/PsyQA_full.json'
    output_dir = 'd:/PsyQA1/data'
    
    print("加载PsyQA数据集...")
    data = load_psyqa_data(data_path)
    print(f"原始数据量: {len(data)}")
    
    print("格式化训练样本...")
    formatted_data = [format_training_sample(item) for item in data]
    
    train_data, test_data = train_test_split(formatted_data, test_size=0.1, random_state=42)
    train_data, val_data = train_test_split(train_data, test_size=0.1, random_state=42)
    
    print(f"训练集: {len(train_data)}")
    print(f"验证集: {len(val_data)}")
    print(f"测试集: {len(test_data)}")
    
    import os
    os.makedirs(output_dir, exist_ok=True)
    
    with open(f'{output_dir}/train.json', 'w', encoding='utf-8') as f:
        json.dump(train_data, f, ensure_ascii=False, indent=2)
    
    with open(f'{output_dir}/val.json', 'w', encoding='utf-8') as f:
        json.dump(val_data, f, ensure_ascii=False, indent=2)
    
    with open(f'{output_dir}/test.json', 'w', encoding='utf-8') as f:
        json.dump(test_data, f, ensure_ascii=False, indent=2)
    
    print("数据集准备完成！")

if __name__ == '__main__':
    main()