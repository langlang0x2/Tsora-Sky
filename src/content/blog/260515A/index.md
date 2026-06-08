---
title:       '判断一致性模型的模型测试性能提升'
publishDate: 2026-05-15
updatedDate: 2026-05-19
description: '降低判断一个历史是否满足一种一致性模型花费的时间'
tags:
  - 分布式系统
  - 一致性模型
  - alloy*
language: 'zh-CN'
---
## 一、一致性模型拓展框架

论文：`TPDS2025 A Generic Specification Framework for Weakly Consistent Replicated Data Types.pdf`

已有工作：`(vis, ar)` 框架是一个**统一描述分布式一致性模型的抽象工具**，用两个关系来刻画：

- **vis（visibility）**：谁“看到了谁”
- **ar（arbitration）**：全局顺序怎么排
- 要求全序 ar → 无法表达 **非收敛模型（CM）**
- 忽略返回值 → 无法满足CM读的值必须被“解释”这一原则

上面两个问题，引出了一个拓展框架，[vis ar V]框架

核心公式如下：找到一个线性序列**同时**能解释事件的返回值**并**能解释这个事件的V集合里面事件的返回值

![image-20260519084339062](./assets/image-20260519084339062.png)

最终将所有一致性模型都用新框架描述：

![image-20260515170245161](./assets/image-20260515170245161.png)

## 二、alloy*代码描述一致性模型

论文：`江雪-博士论文-20240517`

代码仓库：https://github.com/code-artifacts/cm-alloy
论文仓库：https://github.com/research-papers-by-hfwei/alloy-cm

### 1.语言 alloy*（hola）

代码仓库：https://github.com/aleksandarmilicevic/hola

Alloy*(HOLA) 本质上是：Java 写的、打包成 `.jar` 、依赖 JVM（Java Virtual Machine）

这里 安装`Temurin`，即Java发行版OpenJDK的现成编译版本（Java运行环境）

![image-20260519085205934](./assets/image-20260519085205934.png)

```bash
运行：
java -jar hola-0.3_2019-03-23.jar
```

### 2.论文代码部分

##### 模型比较

构造历史来判断是否满足A不满足B，下面为优化

- 写操作都不能写入初始值0
- 保证有一个以上的非同进程的rf关系
- 去除会话 键 值 对称性

##### 模型测试

在`CausalMemoryConvergence`的模型测试中，如果一个会话中包含多个读事件，验证最后一个读事件的返回值即可，因为最后一个会把前面的都解释了

### 3.代码性能优化

1）输入`txt`历史，使用`transformerWithRf.py`将`txt`转换为`als`历史

```bash
python transformer\transformer.py --input [输入历史txt] --output [输出历史als]
python transformer\transformerWithRf.py --input [输入历史txt] --output [输出历史als]
```

2）通过java打开`hola`包和对应的`checkingWithRf`规则

```bash
java -jar D:\Projects\cm\hola-0.3_2019-03-23.jar ./checkingWithRf.als
```



以上两个步骤通过下面批处理文件一次性解决：

```bash
check.bat testHistory\[name].txt
```

弹出GUI后点击Execute - Check `notWCC`，如果找到了反例，说明找到了一个组合满足WCC，即满足WCC模型。这里输出时间。



但是这样看时间比较麻烦，创建test\AutoCheck.java来获取运行时间。

```bash
java -cp "test;D:\Projects\cm\hola-0.3_2019-03-23.jar" AutoCheck checkingWithRf.als notCM
```

创建benchmark来获取多次运行时间花费 [n轮数 k时间]

```bash
python test\benchmark.py --input testHistory\cm-not-scc.txt -n 1 -k 30 -p notSCCv 
python test\run_all_benchmarks.py -n 3 -k 15
python test\compare_benchmarks.py --old test\report_ALL_20260515_220904v0.csv --new test\report_ALL_20260515_225246v3.csv
```





1. 批量处理（默认）

  python solver\consistency_solver.py
  - 自动读取 testHistory 目录下所有 .txt 文件
  - 检查所有 6 种一致性模型：WCC, WCCv, CM, CMv, SCC, SCCv
  - 输出结果到 solver/results.csv

  2. 单个文件调试

  python solver\consistency_solver.py --input testHistory\cm-not-scc.txt --model WCC
  - 输出格式：testHistory\cm-not-scc.txt: WCC = True/False
