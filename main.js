// main.js（第14版 - 完整最终版，使用路由器2）

const { ethers } = require("ethers");
const fs = require("fs");
const { execSync } = require("child_process");
const config = require("./config.js");

// -- بخش تنظیمات اولیه --
const provider = new ethers.providers.JsonRpcProvider(config.RPC_URL);
const privateKey = process.env.PRIVATE_KEY;
if (!privateKey) {
    console.error("错误：未在 GitHub Secrets 中定义私钥（PRIVATE_KEY）。");
    process.exit(1);
}
const wallet = new ethers.Wallet(privateKey, provider);

// -- توابع کمکی --
async function checkBalance() {
    const balance = await wallet.getBalance();
    const minBalance = ethers.utils.parseEther("0.001");
    console.log(`\n当前余额: ${ethers.utils.formatEther(balance)} PHRS`);
    if (balance.lt(minBalance)) {
        console.error("错误：余额不足以支付交易费用。操作已取消。");
        process.exit(1);
    }
}
function readAmounts() {
    if (fs.existsSync(config.AMOUNTS_FILE_PATH)) {
        const data = fs.readFileSync(config.AMOUNTS_FILE_PATH, "utf8");
        try { return JSON.parse(data); } catch (e) { return {}; }
    }
    return {};
}
function writeAndCommitAmounts(amountsToSave) {
    console.log(">> 正在保存新数值到 amounts.json 文件...");
    fs.writeFileSync(config.AMOUNTS_FILE_PATH, JSON.stringify(amountsToSave, null, 2));
    try {
        console.log(">> 正在检查是否需要 commit 和 push 变更...");
        execSync(`git add ${config.AMOUNTS_FILE_PATH}`);
        const status = execSync('git status --porcelain').toString();
        if (status) {
            console.log(">> 检测到新变更，正在提交...");
            execSync('git config --global user.email "igooorng@gmail.com"');
            execSync('git config --global user.name "GitHub Action Bot"');
            execSync('git commit -m "Update token amounts via script"');
            execSync("git push");
            console.log("✅ 数值文件已成功更新到仓库。");
        } else {
            console.log("ℹ️ 没有需要提交的数值变更，跳过 commit。");
        }
    } catch (error) {
        console.error("commit 文件时出错:", error.message.split('\n')[0]);
    }
}
async function sendAndConfirmTransaction(txRequest, description) {
    console.log(`>> 正在发送交易：${description}...`);
    const tx = await wallet.sendTransaction(txRequest);
    console.log(`☑️ 交易已发送。哈希（Hash）：${tx.hash}`);
    console.log(">> 等待交易确认（最多10分钟）...");
    const receipt = await provider.waitForTransaction(tx.hash, 1, 600000);
    if (receipt.status === 0) {
        throw new Error(`❌ 交易哈希为 ${tx.hash} 的交易失败（reverted）。`);
    }
    console.log(`✅ 交易已成功确认。区块：${receipt.blockNumber}`);
    return receipt;
}

// --- 主要任务执行函数 ---
async function runTask(taskName) {
    console.log(`\n--- 开始操作：${taskName} ---`);
    await checkBalance();

    const amounts = readAmounts();
    const deadline = Math.floor(Date.now() / 1000) + 60 * 10;
    const options = { gasLimit: 800000 };

    const wrapper1 = new ethers.Contract(config.ADDRESSES.WRAPPER_1, config.ABIS.WRAPPER, wallet);
    const wrapper2 = new ethers.Contract(config.ADDRESSES.WRAPPER_2, config.ABIS.WRAPPER, wallet);
    const dex1Router = new ethers.Contract(config.ADDRESSES.DEX_1_ROUTER, config.ABIS.DEX_ROUTER, wallet);
    const dex2Router = new ethers.Contract(config.ADDRESSES.DEX_2_ROUTER, config.ABIS.DEX_ROUTER, wallet);
    const usdcOldToken = new ethers.Contract(config.ADDRESSES.USDC_OLD, config.ABIS.ERC20, wallet);
    const tetherToken = new ethers.Contract(config.ADDRESSES.TETHER_USD, config.ABIS.ERC20, wallet);
    const usdcToken = new ethers.Contract(config.ADDRESSES.USDC, config.ABIS.ERC20, wallet);

    switch (taskName) {
        case "WRAP_2":
            await sendAndConfirmTransaction({ to: wrapper2.address, data: wrapper2.interface.encodeFunctionData("deposit"), value: ethers.utils.parseEther("0.001"), ...options }, "在 Wrapper 2 上包装 0.001 PHRS");
            break;
        case "WRAP_1":
            await sendAndConfirmTransaction({ to: wrapper1.address, data: wrapper1.interface.encodeFunctionData("deposit"), value: ethers.utils.parseEther("0.01"), ...options }, "在 Wrapper 1 上包装 0.01 PHRS");
            break;
        case "UNWRAP_2":
            await sendAndConfirmTransaction({ to: wrapper2.address, data: wrapper2.interface.encodeFunctionData("withdraw", [ethers.utils.parseEther("0.001")]), ...options }, "从 Wrapper 2 解包 0.001");
            break;
        case "UNWRAP_1":
            await sendAndConfirmTransaction({ to: wrapper1.address, data: wrapper1.interface.encodeFunctionData("withdraw", [ethers.utils.parseEther("0.01")]), ...options }, "从 Wrapper 1 解包 0.01");
            break;
        case "SWAP_TO_USDC_OLD": {
            const dataPayload = [dex1Router.interface.encodeFunctionData("refundETH")];
            await sendAndConfirmTransaction({ to: dex1Router.address, data: dex1Router.interface.encodeFunctionData("multicall", [deadline, dataPayload]), value: ethers.utils.parseEther("0.001"), ...options }, "通过 multicall 将 PHRS 兑换为 USDC_OLD");
            amounts.USDC_OLD_amount = (await usdcOldToken.balanceOf(wallet.address)).toString();
            writeAndCommitAmounts(amounts);
            break;
        }
        case "SWAP_TO_TETHER": {
            const dataPayload = [dex1Router.interface.encodeFunctionData("refundETH")];
            await sendAndConfirmTransaction({ to: dex1Router.address, data: dex1Router.interface.encodeFunctionData("multicall", [deadline, dataPayload]), value: ethers.utils.parseEther("0.001"), ...options }, "通过 multicall 将 PHRS 兑换为 Tether USD");
            amounts.TETHER_USD_amount = (await tetherToken.balanceOf(wallet.address)).toString();
            writeAndCommitAmounts(amounts);
            break;
        }
        case "SWAP_TETHER_TO_USDC": {
            const tetherAmount = amounts.TETHER_USD_amount;
            if (!tetherAmount || tetherAmount === "0") throw new Error("未找到可用于兑换的 Tether 数量。");
            await sendAndConfirmTransaction({ to: tetherToken.address, data: tetherToken.interface.encodeFunctionData("approve", [dex2Router.address, tetherAmount]), ...options }, "为 DEX 2 授权 Tether");
            await sendAndConfirmTransaction({ to: dex2Router.address, data: dex2Router.interface.encodeFunctionData("swapExactTokensForTokens", [tetherAmount, 0, [config.ADDRESSES.TETHER_USD, config.ADDRESSES.USDC], wallet.address, deadline]), ...options }, "将 Tether 兑换为 USDC");
            amounts.USDC_amount = (await usdcToken.balanceOf(wallet.address)).toString();
            writeAndCommitAmounts(amounts);
            break;
        }
        case "SWAP_USDC_OLD_TO_PHRS": {
            const usdcOldAmount = amounts.USDC_OLD_amount;
            if (!usdcOldAmount || usdcOldAmount === "0") throw new Error("未找到可用于兑换的 USDC_OLD 数量。");
            await sendAndConfirmTransaction({ to: usdcOldToken.address, data: usdcOldToken.interface.encodeFunctionData("approve", [dex2Router.address, usdcOldAmount]), ...options }, "为 DEX 2 授权 USDC_OLD");
            await sendAndConfirmTransaction({ to: dex2Router.address, data: dex2Router.interface.encodeFunctionData("swapExactTokensForETH", [usdcOldAmount, 0, [config.ADDRESSES.USDC_OLD, config.ADDRESSES.WRAPPER_1], wallet.address, deadline]), ...options }, "将 USDC_OLD 兑换为 PHRS");
            break;
        }
        case "SWAP_USDC_TO_PHRS": {
            const usdcAmount = amounts.USDC_amount;
            if (!usdcAmount || usdcAmount === "0") throw new Error("未找到可用于兑换的 USDC 数量。");
            console.log("ℹ️ 本操作将使用 DEX 2 路由器以确保成功。");
            await sendAndConfirmTransaction({ 
                to: usdcToken.address, 
                data: usdcToken.interface.encodeFunctionData("approve", [dex2Router.address, usdcAmount]), 
                ...options 
            }, "为 DEX 2 授权 USDC");
            await sendAndConfirmTransaction({ 
                to: dex2Router.address, 
                data: dex2Router.interface.encodeFunctionData("swapExactTokensForETH", [
                    usdcAmount, 
                    0, 
                    [config.ADDRESSES.USDC, config.ADDRESSES.WRAPPER_2], 
                    wallet.address, 
                    deadline
                ]), 
                ...options 
            }, "通过 DEX 2 将 USDC 兑换为 PHRS");
            break;
        }
        case "TEST_ALL":
            console.log("!!! 开始完整流程测试 !!!");
            await runTask("WRAP_2");
            await runTask("SWAP_TO_USDC_OLD");
            await runTask("WRAP_1");
            await runTask("SWAP_TO_TETHER");
            await runTask("SWAP_TETHER_TO_USDC");
            await runTask("SWAP_USDC_OLD_TO_PHRS");
            await runTask("SWAP_USDC_TO_PHRS");
            await runTask("UNWRAP_2");
            await runTask("UNWRAP_1");
            console.log("!!! 完整测试已成功完成 !!!");
            break;
        default:
            throw new Error(`未知任务 \"${taskName}\"`);
    }
}

const taskToRun = process.argv[2];
if (!taskToRun) {
    console.error("错误：请将任务名称作为参数输入。");
    process.exit(1);
}
runTask(taskToRun)
    .then(() => console.log(`\n✅✅✅ 任务 ${taskToRun} 执行成功 ✅✅✅`))
    .catch(error => {
        console.error(`\n❌❌❌ 执行任务 ${taskToRun} 时发生错误 ❌❌❌`);
        console.error(error.reason || error.message || error);
        process.exit(1);
    });
