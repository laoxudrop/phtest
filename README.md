# Pharos Network 自动化脚本说明

## 项目简介
本项目为 Pharos 测试网自动化操作脚本，基于 Node.js 和 ethers.js 实现，支持一键完成代币包装、兑换、授权、余额检查等链上操作，适用于自动化测试和批量操作场景。

## 目录结构
```
├── .env                        # 环境变量配置（如私钥等，需自行创建）
├── .github/workflows/          # GitHub Actions 自动化工作流
│   ├── manual-test-run.yml     # 手动触发的测试流程
│   └── scheduled_operations.yml# 定时自动化操作流程
├── .gitignore                  # Git 忽略文件配置
├── LICENSE                     # 开源协议（MIT）
├── README.md                   # 项目说明文档
├── amounts.json                # 记录各代币余额的本地文件
├── config.js                   # 配置文件，包含RPC、合约地址、ABI等
├── main.js                     # 主脚本，包含所有核心逻辑
└── package.json                # Node.js 依赖与脚本配置
```

## 依赖安装
1. 安装 Node.js（建议 v14 及以上）
2. 安装依赖包：
```bash
npm install
```

## 配置说明
- **私钥配置**：
  - 推荐通过环境变量 `PRIVATE_KEY` 注入私钥。
  - 也可直接在 `main.js` 中设置（不推荐，存在泄露风险）。
- **RPC 节点**：
  - 默认使用 `config.js` 中的 `RPC_URL`，如需更换请自行修改。
- **合约地址与 ABI**：
  - 所有合约地址和 ABI 已在 `config.js` 中配置，无需手动更改。

## 主要功能
- 检查钱包余额，自动终止余额不足的操作
- 支持 PHRS 包装/解包（Wrapper 1/2）
- 支持 PHRS 与 USDC_OLD、Tether USD、USDC 之间的兑换
- 自动记录并提交代币余额变更到 `amounts.json`，并推送到仓库
- 支持完整流程一键测试

## 使用方法
1. 启动脚本前请确保 `.env` 文件已正确配置私钥。
2. 运行指定任务：
```bash
node main.js 任务名称
```
- 支持的任务名称：
  - WRAP_2
  - WRAP_1
  - UNWRAP_2
  - UNWRAP_1
  - SWAP_TO_USDC_OLD
  - SWAP_TO_TETHER
  - SWAP_TETHER_TO_USDC
  - SWAP_USDC_OLD_TO_PHRS
  - SWAP_USDC_TO_PHRS
  - TEST_ALL（执行完整流程）

## 注意事项
- 请勿将私钥明文上传至公共仓库。
- 建议在测试网环境下使用，主网操作需谨慎。
- 若需自动化运行，建议结合 GitHub Actions 并妥善配置 Secrets。

## 开源协议
本项目采用 MIT License，详情见 LICENSE 文件。