import requests
import json
import os
import time

def download_file(url, save_path):
    try:
        response = requests.get(url, timeout=30)
        response.raise_for_status()
        
        os.makedirs(os.path.dirname(save_path), exist_ok=True)
        with open(save_path, 'wb') as f:
            f.write(response.content)
        
        print("[OK] 下载成功: %s" % save_path)
        return True
    except Exception as e:
        print("[FAIL] 下载失败 %s: %s" % (url, str(e)))
        return False

def download_psyqa():
    print("\n正在下载PsyQA数据集...")
    
    urls = [
        ("https://raw.githubusercontent.com/thu-coai/PsyQA/main/data/PsyQA_full.json", 
         "data/PsyQA_full.json"),
        ("https://raw.githubusercontent.com/thu-coai/PsyQA/main/data/train.json",
         "data/train.json"),
        ("https://raw.githubusercontent.com/thu-coai/PsyQA/main/data/val.json",
         "data/val.json"),
        ("https://raw.githubusercontent.com/thu-coai/PsyQA/main/data/test.json",
         "data/test.json")
    ]
    
    success_count = 0
    for url, save_path in urls:
        if download_file(url, save_path):
            success_count += 1
        time.sleep(1)
    
    print("\nPsyQA数据集下载完成，成功 %d/%d" % (success_count, len(urls)))

def download_supplement():
    print("\n正在下载补充数据集...")
    
    base_url = "https://raw.githubusercontent.com/thu-coai/PsyQA/main"
    urls = [
        ("%s/generation_split/large_span_enstra_PsyQA_train.json" % base_url,
         "PsyQA_generation_split/large_span_enstra_PsyQA_train.json"),
        ("%s/generation_split/large_span_enstra_PsyQA_dev.json" % base_url,
         "PsyQA_generation_split/large_span_enstra_PsyQA_dev.json"),
        ("%s/generation_split/large_span_enstra_PsyQA_test.json" % base_url,
         "PsyQA_generation_split/large_span_enstra_PsyQA_test.json")
    ]
    
    success_count = 0
    for url, save_path in urls:
        if download_file(url, save_path):
            success_count += 1
        time.sleep(1)
    
    print("\n补充数据集下载完成，成功 %d/%d" % (success_count, len(urls)))

def verify_data():
    print("\n验证数据完整性...")
    
    data_files = [
        "data/PsyQA_full.json",
        "data/train.json",
        "data/val.json",
        "data/test.json"
    ]
    
    total_count = 0
    for file_path in data_files:
        if os.path.exists(file_path):
            try:
                with open(file_path, 'r', encoding='utf-8') as f:
                    data = json.load(f)
                    count = len(data)
                    total_count += count
                    print("[OK] %s: %d 条记录" % (file_path, count))
            except Exception as e:
                print("[FAIL] 解析失败 %s: %s" % (file_path, str(e)))
        else:
            print("[FAIL] 文件不存在: %s" % file_path)
    
    print("\n总计: %d 条心理问答数据" % total_count)
    return total_count

def main():
    print("==========================================")
    print("心理数据合法获取工具")
    print("==========================================")
    print("本工具仅下载公开授权的数据集")
    print("数据源：清华大学 PsyQA 项目")
    print("遵守 CC BY-NC-SA 4.0 许可证")
    print("==========================================")
    
    os.makedirs('data', exist_ok=True)
    os.makedirs('PsyQA_generation_split', exist_ok=True)
    
    download_psyqa()
    download_supplement()
    verify_data()
    
    print("\n数据获取完成！")
    print("数据保存在 data/ 和 PsyQA_generation_split/ 目录")
    print("可用于学术研究和非商业用途")

if __name__ == '__main__':
    main()
