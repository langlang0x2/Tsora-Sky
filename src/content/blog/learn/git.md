---
title:       'git使用'
description: '记录如何使用git以及约定式提交'
publishDate: 2026-01-07
updatedDate: 2026-01-25
tags:
  - git
language: 'zh-CN'
---



### 一、git基础使用

#### 1. git设置

```shell	
git config --global user.name "Your name"

git config --global user.email "Your email"

git version
```



#### 2. git本地仓库创建

```shell
#初始化本地仓库
git init [-b main]

#用远程仓库初始化本地仓库
git clone <URL>
```



#### 3. git本地仓库提交

```shell
#添加文件到暂存区
git add foldername filename
git rm filename
git rm -r foldername

#只update已被 Git 跟踪的文件
git add -u

#查看暂存区
git status

#暂存区提交到本地仓库
#[]可选
# -a 会自动暂存所有已跟踪文件的修改
git commit -a -m "Short summary" [-m "Detailed explanation of the changes"]
```



#### 4. git分支

```shell
#列出所有分支
git branch

#创建新的分支
# -d 删除
git branch <branch>

#切换到已有分支
git checkout <branch>

#创建新分支并切换到该分支
git checkout -b <branch>
```



#### 5. git远程仓库

```shell
#查看当前远程仓库
git remote -v

#连接远程仓库（取名为origin）
git remote add origin <URL>

#本地仓库提交远程仓库
# -u 即 --set-upstream 把本地分支和远程分支建立追踪关系
git push [-u origin <branch>]
#只设置追踪关系
git branch --set-upstream-to=origin/<branch>

#同步更新
# fetch 拿到远程最新代码，但不改当前分支，只改远程镜像
# merge 远程镜像合并到本地的当前分支
git pull origin main
== git fetch origin main + git merge origin/main

```



#### 6. git保存环境

```shell
#把 未提交的修改（包括已 add 的和未 add 的）存到 stash 栈中。
git stash [push/pop]
```



#### 7. git历史记录

```shell
#图形化显示分支结构，适合看分支合并关系
git log [--graph --oneline --all]
```



### 二、git约定式提交

**Conventional Commits（约定式提交）** 规范，格式是：

```
<type>(<scope>): <emoji> <subject>
```

**常用的 type（类型）：**

- `feat`: ✨ 新功能
- `fix`: 🐛 修复bug
- `docs`: 📝 文档更新
- `style`: 🎨 代码格式调整（不影响功能）
- `refactor`: ♻️ 重构代码
- `perf`: ⚡ 性能优化
- `test`: ✅ 测试相关
- `chore`: 🔧 构建/配置/依赖更新

**scope（范围）：**

- `pages`: 页面
- `components`: 组件
- `public`: 静态资源
- `blog`: 博客文章