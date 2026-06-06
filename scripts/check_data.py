import json

with open('d:/PsyQA1/PsyQA/PsyQA_full.json', 'r', encoding='utf-8') as f:
    data = json.load(f)

print(f"数据集大小: {len(data)}")
print(f"\n第一条数据结构:")
first_item = data[0]
for key, value in first_item.items():
    print(f"  {key}: {type(value).__name__}")
    if isinstance(value, str) and len(value) > 50:
        print(f"    值示例: {value[:50]}...")
    elif isinstance(value, list):
        print(f"    列表长度: {len(value)}")
        if len(value) > 0 and isinstance(value[0], dict):
            print(f"    列表元素结构: {list(value[0].keys())}")