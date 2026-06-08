---
title: 'Mega-SAM：运动与结构重建'
publishDate: 2026-05-21
description: '复现 Mega-SAM 论文的实践记录'
tags:
  - 计算机视觉
  - SFM
  - 深度估计
language: 'zh-CN'
---

课程：计算机视觉

实践方向：运动与结构重建

论文：2412.04463v2.pdf

代码仓库：https://github.com/mega-sam/mega-sam

运行环境

- WSL Ubuntu 24.04.4 LTS
- Torch: 2.11.0+cu128

输入:连续图片 输出:相机位姿、焦距、稠密视频深度图



直接将视频转换为图片序列会导致显存不够用
这里采用降低画质和帧率来确保不爆显存

```bash
ffmpeg -i input.mp4 -t 20 -vf "scale=560:316,fps=10" -c:v libx264 -crf 18 output.mp4
```

-t 20确保前20s，防止帧数过多运行不了，这里帧数为200帧

由于这个项目输入为图片序列，这里转换为`png`序列

```bash
ffmpeg -i output.mp4 C:\Users\13524\Downloads\my_video1\%06d.png
```



将其设置为数据集：修改`evalset`或直接使用官方数据集
此次测试为依次运行下列脚本：

```bash
# 1. 计算单目深度（Depth Anything + UniDepth）
./mono_depth_scripts/run_mono-depth_sintel.sh
#	输出：Depth-Anything/video_visualization/$seq、UniDepth/outputs
# 2. 相机追踪（图片序列 + 单目深度结果 + 预训练权重）BA
./tools/evaluate_sintel.sh
# 3. 深度优化
./cvd_opt/cvd_opt_ sintel.sh
#  1）用 RAFT 模型计算光流 (preprocess_flow.py)
#	 输出：./cache_flow/<场景名>/
#  2）执行一致视频深度优化 (cvd_opt.py)
#	 输出：./outputs_cvd_sintel/*.npz
```

评估方法

```bash
# 1. 官方评估方法为项目提供的脚本文件，分别为位姿误差评估和深度误差评估
python ./evaluations_poses/evaluate_sintel.py
python ./evaluations_depth/evaluate_depth_ours_sintel.py

# 2. 自行评估
# 1) 单帧深度可视化（相机追踪输出）
python3 tools/visualize_native_npz.py \
  --npz outputs/my_video_droid.npz \
  --frame 0

# 2) 单帧深度可视化（最终优化输出，推荐看这个）
python3 tools/visualize_native_npz.py \
  --npz outputs_cvd/my_video_sgd_cvd_hr.npz \
  --frame 0

# 3) 导出深度可视化图片（不弹窗）
python3 tools/visualize_native_npz.py \
  --npz outputs_cvd/my_video_sgd_cvd_hr.npz \
  --frame 10 \
  --save outputs_cvd/frame10_depth_vis.png \
  --no-show

# 4) 一条命令看轨迹 + 3D场景（交互窗口）
python3 tools/view_scene_open3d.py \
  --npz outputs_cvd/my_video_sgd_cvd_hr.npz

# open3d运行报错
# 日志有 Wayland 警告，尝试强制 X11解决
export XDG_SESSION_TYPE=x11
```



