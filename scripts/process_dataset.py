import os
import json
import re
import random
import sys
from typing import List, Dict, Any

try:
    from sklearn.model_selection import train_test_split
except ImportError:
    print("请安装 scikit-learn: pip install scikit-learn")
    sys.exit(1)

def load_json_file(file_path: str) -> List[Dict[str, Any]]:
    with open(file_path, 'r', encoding='utf-8') as f:
        return json.load(f)

def load_jsonl_file(file_path: str) -> List[Dict[str, Any]]:
    data = []
    with open(file_path, 'r', encoding='utf-8') as f:
        for line in f:
            line = line.strip()
            if line:
                data.append(json.loads(line))
    return data

def clean_text(text: str) -> str:
    text = text.strip()
    text = re.sub(r'\\s+', ' ', text)
    text = re.sub(r'[^\u4e00-\u9fa5a-zA-Z0-9，。！？、；：""''（）《》【】 ]', '', text)
    text = re.sub(r'[.!?。！？]+', '。', text)
    text = re.sub(r'[,，、；:：]+', '，', text)
    return text.strip()

def convert_to_train_format(item: Dict[str, Any], source_type: str) -> Dict[str, str]:
    instruction = "你是专业的大学生心理健康陪伴AI，请温柔、耐心地倾听用户的困扰，并给予理解、支持和科学的建议。"
    
    if source_type == 'psyqa_full':
        question = item.get('question', '')
        description = item.get('description', '')
        answers = item.get('answers', [])
        input_text = f"问题：{question}"
        if description:
            input_text += f"\n描述：{description}"
        output_text = answers[0].get('answer_text', '') if answers else ''
    
    elif source_type == 'train_val_test':
        input_text = item.get('input', '')
        output_text = item.get('output', '')
        custom_instruction = item.get('instruction', '')
        if custom_instruction:
            instruction = custom_instruction
    
    elif source_type == 'mental_jsonl':
        input_text = item.get('input', '')
        output_text = item.get('output', '')
        custom_instruction = item.get('instruction', '')
        if custom_instruction:
            instruction = custom_instruction
    
    elif source_type == 'generation_split':
        input_text = item.get('input', '')
        output_text = item.get('output', '')
        instruction = item.get('instruction', instruction)
    
    else:
        input_text = item.get('input', item.get('question', ''))
        output_text = item.get('output', '')
    
    input_text = clean_text(input_text)
    output_text = clean_text(output_text)
    
    return {
        'instruction': instruction,
        'input': input_text,
        'output': output_text
    }

def filter_short_items(data: List[Dict[str, str]], min_length: int = 10) -> List[Dict[str, str]]:
    return [
        item for item in data
        if len(item.get('input', '')) >= min_length and len(item.get('output', '')) >= min_length
    ]

def remove_duplicates(data: List[Dict[str, str]]) -> List[Dict[str, str]]:
    seen = set()
    unique_data = []
    for item in data:
        key = (item['input'], item['output'])
        if key not in seen:
            seen.add(key)
            unique_data.append(item)
    return unique_data

def augment_data(data: List[Dict[str, str]], augment_ratio: float = 0.2) -> List[Dict[str, str]]:
    augmented = []
    for item in data:
        augmented.append(item)
        
        if random.random() < augment_ratio:
            original_input = item['input']
            original_output = item['output']
            
            if '压力' in original_input:
                variations = ['最近压力好大', '感觉压力重重', '压力让我喘不过气']
                for v in variations:
                    if v not in original_input:
                        new_item = item.copy()
                        new_item['input'] = original_input.replace('压力', v[:2])
                        augmented.append(new_item)
                        break
            
            if '焦虑' in original_input:
                variations = ['心里很焦虑', '感到很焦虑', '特别焦虑']
                for v in variations:
                    if v not in original_input:
                        new_item = item.copy()
                        new_item['input'] = original_input.replace('焦虑', v[:2])
                        augmented.append(new_item)
                        break
    
    return augmented

def categorize_by_keywords(data: List[Dict[str, str]]) -> Dict[str, List[Dict[str, str]]]:
    categories = {
        '学习压力': ['学习', '考试', '考研', '高考', '作业', '成绩', '复习'],
        '人际关系': ['朋友', '室友', '同学', '社交', '孤独', '孤单'],
        '情绪问题': ['焦虑', '抑郁', '情绪', '心情', '低落', '烦躁'],
        '家庭关系': ['父母', '家人', '妈妈', '爸爸', '家庭'],
        '恋爱问题': ['恋爱', '失恋', '感情', '喜欢', '分手'],
        '未来迷茫': ['迷茫', '未来', '方向', '目标', '选择'],
        '自我认知': ['自信', '自卑', '自我', '自己', '价值']
    }
    
    categorized = {cat: [] for cat in categories}
    categorized['其他'] = []
    
    for item in data:
        input_text = item['input']
        matched = False
        
        for category, keywords in categories.items():
            for kw in keywords:
                if kw in input_text:
                    categorized[category].append(item)
                    matched = True
                    break
            if matched:
                break
        
        if not matched:
            categorized['其他'].append(item)
    
    return categorized

def analyze_data(data: List[Dict[str, str]]) -> Dict[str, Any]:
    total = len(data)
    avg_input_len = sum(len(item['input']) for item in data) / total
    avg_output_len = sum(len(item['output']) for item in data) / total
    
    categories = categorize_by_keywords(data)
    category_stats = {cat: len(items) for cat, items in categories.items()}
    
    return {
        'total_samples': total,
        'avg_input_length': round(avg_input_len, 2),
        'avg_output_length': round(avg_output_len, 2),
        'category_distribution': category_stats
    }

def save_data(data: List[Dict[str, str]], file_path: str, format_type: str = 'json') -> None:
    os.makedirs(os.path.dirname(file_path), exist_ok=True)
    
    if format_type == 'jsonl':
        with open(file_path, 'w', encoding='utf-8') as f:
            for item in data:
                f.write(json.dumps(item, ensure_ascii=False) + '\n')
    else:
        with open(file_path, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)

def main():
    print("=== 心理数据集处理流程 ===", flush=True)
    
    sources = [
        {
            'path': 'd:/PsyQA1/PsyQA/PsyQA_full.json',
            'type': 'psyqa_full'
        },
        {
            'path': 'd:/PsyQA1/data/train.json',
            'type': 'train_val_test'
        },
        {
            'path': 'd:/PsyQA1/data/val.json',
            'type': 'train_val_test'
        },
        {
            'path': 'd:/PsyQA1/data/test.json',
            'type': 'train_val_test'
        },
        {
            'path': 'd:/PsyQA1/PsyQA/server/data/mental_data.jsonl',
            'type': 'mental_jsonl'
        },
        {
            'path': 'd:/PsyQA1/PsyQA/PsyQA_generation_split/large_span_enstra_PsyQA_train.json',
            'type': 'generation_split'
        },
        {
            'path': 'd:/PsyQA1/PsyQA/PsyQA_generation_split/large_span_enstra_PsyQA_dev.json',
            'type': 'generation_split'
        },
        {
            'path': 'd:/PsyQA1/PsyQA/PsyQA_generation_split/large_span_enstra_PsyQA_test.json',
            'type': 'generation_split'
        },
        {
            'path': 'd:/PsyQA1/PsyQA/PsyQA_supplement/split_dataset/ctx_data_train.json',
            'type': 'generation_split'
        },
        {
            'path': 'd:/PsyQA1/PsyQA/PsyQA_supplement/split_dataset/ctx_data_dev.json',
            'type': 'generation_split'
        },
        {
            'path': 'd:/PsyQA1/PsyQA/PsyQA_supplement/split_dataset/ctx_data_test.json',
            'type': 'generation_split'
        }
    ]
    
    all_data = []
    for source in sources:
        try:
            if source['path'].endswith('.jsonl'):
                raw_data = load_jsonl_file(source['path'])
            else:
                raw_data = load_json_file(source['path'])
            
            converted = [convert_to_train_format(item, source['type']) for item in raw_data]
            all_data.extend(converted)
            print("[OK] 加载 %s: %d 条" % (source['path'], len(raw_data)))
        except Exception as e:
            print("[FAIL] 加载 %s 失败: %s" % (source['path'], str(e)))
    
    print("\n原始数据总量: %d 条" % len(all_data))
    
    all_data = filter_short_items(all_data)
    print("过滤短文本后: %d 条" % len(all_data))
    
    all_data = remove_duplicates(all_data)
    print("去重后: %d 条" % len(all_data))
    
    all_data = augment_data(all_data, augment_ratio=0.15)
    print("数据增强后: %d 条" % len(all_data))
    
    random.shuffle(all_data)
    
    stats = analyze_data(all_data)
    print("\n=== 数据集统计 ===")
    print("总样本数: %d" % stats['total_samples'])
    print("平均输入长度: %.2f 字" % stats['avg_input_length'])
    print("平均输出长度: %.2f 字" % stats['avg_output_length'])
    print("\n类别分布:")
    for cat, count in stats['category_distribution'].items():
        percentage = (count / stats['total_samples']) * 100
        print("  %s: %d 条 (%.1f%%)" % (cat, count, percentage))
    
    train_data, temp_data = train_test_split(all_data, test_size=0.2, random_state=42)
    val_data, test_data = train_test_split(temp_data, test_size=0.5, random_state=42)
    
    print("\n数据集划分:")
    print("  训练集: %d 条" % len(train_data))
    print("  验证集: %d 条" % len(val_data))
    print("  测试集: %d 条" % len(test_data))
    
    output_dir = 'd:/PsyQA1/processed_data'
    
    save_data(train_data, output_dir + '/train.json')
    save_data(val_data, output_dir + '/val.json')
    save_data(test_data, output_dir + '/test.json')
    save_data(all_data, output_dir + '/all_data.json')
    
    save_data(train_data, output_dir + '/train.jsonl', format_type='jsonl')
    save_data(val_data, output_dir + '/val.jsonl', format_type='jsonl')
    save_data(test_data, output_dir + '/test.jsonl', format_type='jsonl')
    
    print("\n[DONE] 处理完成！数据已保存至 %s" % output_dir)

if __name__ == '__main__':
    main()
