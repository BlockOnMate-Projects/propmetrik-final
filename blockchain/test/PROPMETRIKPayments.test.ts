import { expect } from "chai";
import { ethers } from "hardhat";
import {
  PROPMETRIKPayments,
  MockERC20,
} from "../typechain-types";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

describe("PROPMETRIKPayments — Multi-Token", function () {
  let contract: PROPMETRIKPayments;
  let usdt: MockERC20;
  let usdc: MockERC20;
  let weth: MockERC20;
  let wbtc: MockERC20;
  let owner: SignerWithAddress;
  let tenant: SignerWithAddress;
  let propmetrik: SignerWithAddress;
  let recipient1: SignerWithAddress;
  let recipient2: SignerWithAddress;

  const ENTITY_ID_1 = ethers.keccak256(ethers.toUtf8Bytes("entity-001"));
  const ENTITY_ID_2 = ethers.keccak256(ethers.toUtf8Bytes("entity-002"));

  // Amounts in native token decimals
  const USDT_AMOUNT  = ethers.parseUnits("1000", 6);   // 1000 USDT
  const USDC_AMOUNT  = ethers.parseUnits("1000", 6);   // 1000 USDC
  const WETH_AMOUNT  = ethers.parseUnits("1",    18);   // 1 WETH
  const WBTC_AMOUNT  = ethers.parseUnits("0.5",  8);    // 0.5 BTC
  const SMALL_RENT   = ethers.parseUnits("100",  6);    // $100 rent (USDT)
  const LARGE_RENT   = ethers.parseUnits("5000", 6);    // $5000 rent (USDT)
  const DEAL_AMOUNT  = ethers.parseUnits("10000", 6);   // $10k deal (USDT)

  const GAS_BUDGET = 160_000;

  beforeEach(async function () {
    [owner, tenant, propmetrik, recipient1, recipient2] = await ethers.getSigners();

    // Deploy mock tokens with different decimals
    const MockERC20Factory = await ethers.getContractFactory("MockERC20");
    usdt = await MockERC20Factory.deploy("Mock USDT", "USDT", 6) as unknown as MockERC20;
    usdc = await MockERC20Factory.deploy("Mock USDC", "USDC", 6) as unknown as MockERC20;
    weth = await MockERC20Factory.deploy("Mock WETH", "WETH", 18) as unknown as MockERC20;
    wbtc = await MockERC20Factory.deploy("Mock WBTC", "WBTC", 8) as unknown as MockERC20;

    // Deploy contract
    const PaymentsFactory = await ethers.getContractFactory("PROPMETRIKPayments");
    contract = await PaymentsFactory.deploy(propmetrik.address, owner.address) as unknown as PROPMETRIKPayments;

    // Add tokens to allowlist
    await contract.addToken(await usdt.getAddress(), "USDT", 6);
    await contract.addToken(await usdc.getAddress(), "USDC", 6);
    await contract.addToken(await weth.getAddress(), "WETH", 18);
    await contract.addToken(await wbtc.getAddress(), "WBTC", 8);

    // Mint tokens to tenant
    await usdt.mint(tenant.address, ethers.parseUnits("1000000", 6));
    await usdc.mint(tenant.address, ethers.parseUnits("1000000", 6));
    await weth.mint(tenant.address, ethers.parseUnits("1000", 18));
    await wbtc.mint(tenant.address, ethers.parseUnits("1000", 8));

    // Approve contract
    const contractAddr = await contract.getAddress();
    await usdt.connect(tenant).approve(contractAddr, ethers.MaxUint256);
    await usdc.connect(tenant).approve(contractAddr, ethers.MaxUint256);
    await weth.connect(tenant).approve(contractAddr, ethers.MaxUint256);
    await wbtc.connect(tenant).approve(contractAddr, ethers.MaxUint256);

    // Register recipients
    await contract.registerRecipient(ENTITY_ID_1, recipient1.address);
    await contract.registerRecipient(ENTITY_ID_2, recipient2.address);
  });

  // ═══════════════════════════════════════════════════════════════════
  //  1 — Deployment & Initialization
  // ═══════════════════════════════════════════════════════════════════

  describe("1 — Deployment", function () {
    it("sets propmetrikWallet correctly", async function () {
      expect(await contract.propmetrikWallet()).to.equal(propmetrik.address);
    });

    it("sets owner correctly", async function () {
      expect(await contract.owner()).to.equal(owner.address);
    });

    it("rejects zero address for platform wallet", async function () {
      const F = await ethers.getContractFactory("PROPMETRIKPayments");
      await expect(F.deploy(ethers.ZeroAddress, owner.address))
        .to.be.revertedWith("Platform wallet cannot be zero");
    });

    it("initialises default fee configs", async function () {
      const rent = await contract.feeConfigs(0); // RENT
      expect(rent.percentageBasisPoints).to.equal(100);
      expect(rent.minimumFeeUSD6).to.equal(1_650000);
      expect(rent.enabled).to.be.true;

      const deal = await contract.feeConfigs(1); // DEAL
      expect(deal.percentageBasisPoints).to.equal(25);
      expect(deal.minimumFeeUSD6).to.equal(0);
      expect(deal.enabled).to.be.true;

      const project = await contract.feeConfigs(2); // PROJECT
      expect(project.percentageBasisPoints).to.equal(25);
      expect(project.minimumFeeUSD6).to.equal(0);
      expect(project.enabled).to.be.true;

      const valuation = await contract.feeConfigs(3); // VALUATION
      expect(valuation.percentageBasisPoints).to.equal(250);
      expect(valuation.minimumFeeUSD6).to.equal(0);
      expect(valuation.enabled).to.be.true;
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  //  2 — Token Management
  // ═══════════════════════════════════════════════════════════════════

  describe("2 — Token Management", function () {
    it("reports 4 tokens added", async function () {
      expect(await contract.getTokenCount()).to.equal(4);
    });

    it("returns correct token config via isTokenAccepted", async function () {
      const [enabled, symbol, decimals] = await contract.isTokenAccepted(await usdt.getAddress());
      expect(enabled).to.be.true;
      expect(symbol).to.equal("USDT");
      expect(decimals).to.equal(6);
    });

    it("returns correct WETH config (18 decimals)", async function () {
      const [enabled, symbol, decimals] = await contract.isTokenAccepted(await weth.getAddress());
      expect(enabled).to.be.true;
      expect(symbol).to.equal("WETH");
      expect(decimals).to.equal(18);
    });

    it("rejects duplicate token addition", async function () {
      await expect(contract.addToken(await usdt.getAddress(), "USDT", 6))
        .to.be.revertedWith("Token already added");
    });

    it("rejects zero address token", async function () {
      await expect(contract.addToken(ethers.ZeroAddress, "NULL", 0))
        .to.be.revertedWith("Token cannot be zero address");
    });

    it("only owner can add token", async function () {
      const MockF = await ethers.getContractFactory("MockERC20");
      const newTok = await MockF.deploy("Token X", "TOKX", 8);
      await expect(contract.connect(tenant).addToken(await newTok.getAddress(), "TOKX", 8))
        .to.be.revertedWithCustomError(contract, "OwnableUnauthorizedAccount");
    });

    it("can disable then re-enable a token", async function () {
      const addr = await usdc.getAddress();
      await contract.setTokenEnabled(addr, false);
      let [enabled] = await contract.isTokenAccepted(addr);
      expect(enabled).to.be.false;

      await contract.setTokenEnabled(addr, true);
      [enabled] = await contract.isTokenAccepted(addr);
      expect(enabled).to.be.true;
    });

    it("rejects setTokenEnabled for unregistered token", async function () {
      await expect(contract.setTokenEnabled(ethers.Wallet.createRandom().address, false))
        .to.be.revertedWith("Token not registered");
    });

    it("can remove a token and re-add it", async function () {
      const addr = await usdc.getAddress();
      await contract.removeToken(addr);

      // After removal, isTokenAccepted returns defaults
      const [enabled, symbol] = await contract.isTokenAccepted(addr);
      expect(enabled).to.be.false;
      expect(symbol).to.equal("");

      // Can re-add
      await contract.addToken(addr, "USDC-v2", 6);
      const [en2, sym2, dec2] = await contract.isTokenAccepted(addr);
      expect(en2).to.be.true;
      expect(sym2).to.equal("USDC-v2");
      expect(dec2).to.equal(6);
    });

    it("emits TokenAdded event", async function () {
      const MockF = await ethers.getContractFactory("MockERC20");
      const dai = await MockF.deploy("DAI", "DAI", 18);
      await expect(contract.addToken(await dai.getAddress(), "DAI", 18))
        .to.emit(contract, "TokenAdded")
        .withArgs(await dai.getAddress(), "DAI", 18);
    });

    it("emits TokenToggled event", async function () {
      const addr = await usdt.getAddress();
      await expect(contract.setTokenEnabled(addr, false))
        .to.emit(contract, "TokenToggled")
        .withArgs(addr, false);
    });

    it("emits TokenRemoved event", async function () {
      const addr = await usdc.getAddress();
      await expect(contract.removeToken(addr))
        .to.emit(contract, "TokenRemoved")
        .withArgs(addr);
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  //  3 — Fee Calculation (multi-decimal)
  // ═══════════════════════════════════════════════════════════════════

  describe("3 — Fee Calculation", function () {
    it("RENT — small amount triggers minimum fee ($1.65 USDT)", async function () {
      const fee = await contract.calculateFee(await usdt.getAddress(), 0, SMALL_RENT);
      // 1% of 100 = 1.00, but minimum is 1.65 → fee = 1_650000
      expect(fee).to.equal(1_650000);
    });

    it("RENT — large amount uses percentage (1%)", async function () {
      const fee = await contract.calculateFee(await usdt.getAddress(), 0, LARGE_RENT);
      // 1% of 5000 = 50.00 > 1.65 → fee = 50_000000
      expect(fee).to.equal(50_000000);
    });

    it("RENT — WETH uses percentage when minimum is not configured", async function () {
      // Non-6-dec tokens default minimum disabled unless owner configures pricing
      const smallWeth = ethers.parseUnits("0.001", 18);
      const fee = await contract.calculateFee(await weth.getAddress(), 0, smallWeth);
      expect(fee).to.equal(ethers.parseUnits("0.00001", 18));
    });

    it("RENT — WETH large amount uses percentage", async function () {
      // 200 WETH rent → 1% = 2 WETH >> scaled minimum (1.65e18)
      const largeWeth = ethers.parseUnits("200", 18);
      const fee = await contract.calculateFee(await weth.getAddress(), 0, largeWeth);
      expect(fee).to.equal(ethers.parseUnits("2", 18));
    });

    it("DEAL — 0.25% fee with USDT (6 decimals)", async function () {
      const fee = await contract.calculateFee(await usdt.getAddress(), 1, DEAL_AMOUNT);
      // 0.25% of 10000 = 25.00 → 25_000000
      expect(fee).to.equal(25_000000);
    });

    it("DEAL — 0.25% fee with USDC (6 decimals)", async function () {
      const fee = await contract.calculateFee(await usdc.getAddress(), 1, DEAL_AMOUNT);
      expect(fee).to.equal(25_000000);
    });

    it("DEAL — 0.25% fee with WETH (18 decimals)", async function () {
      const amount = ethers.parseUnits("10", 18);
      const fee = await contract.calculateFee(await weth.getAddress(), 1, amount);
      // 0.25% of 10 = 0.025 WETH
      expect(fee).to.equal(ethers.parseUnits("0.025", 18));
    });

    it("PROJECT — 0.25% fee", async function () {
      const amount = ethers.parseUnits("50000", 6);
      const fee = await contract.calculateFee(await usdt.getAddress(), 2, amount);
      // 0.25% of 50000 = 125 → 125_000000
      expect(fee).to.equal(125_000000);
    });

    it("VALUATION — 2.5% fee with USDT (6 decimals)", async function () {
      const amount = ethers.parseUnits("5000", 6); // $5000 valuation
      const fee = await contract.calculateFee(await usdt.getAddress(), 3, amount);
      // 2.5% of 5000 = 125 → 125_000000
      expect(fee).to.equal(125_000000);
    });

    it("VALUATION — 2.5% fee with USDC (6 decimals)", async function () {
      const amount = ethers.parseUnits("10000", 6); // $10k valuation
      const fee = await contract.calculateFee(await usdc.getAddress(), 3, amount);
      // 2.5% of 10000 = 250 → 250_000000
      expect(fee).to.equal(250_000000);
    });

    it("VALUATION — 2.5% fee with WETH (18 decimals)", async function () {
      const amount = ethers.parseUnits("10", 18); // 10 WETH
      const fee = await contract.calculateFee(await weth.getAddress(), 3, amount);
      // 2.5% of 10 = 0.25 WETH
      expect(fee).to.equal(ethers.parseUnits("0.25", 18));
    });

    it("VALUATION — 2.5% fee with WBTC (8 decimals)", async function () {
      const amount = ethers.parseUnits("1", 8); // 1 BTC
      const fee = await contract.calculateFee(await wbtc.getAddress(), 3, amount);
      // 2.5% of 1 = 0.025 BTC = 2_500000 (8 dec units)
      expect(fee).to.equal(ethers.parseUnits("0.025", 8));
    });

    it("RENT — WBTC uses percentage when minimum is not configured", async function () {
      // 0.0001 BTC rent → 1% = 0.000001 BTC = 100 units
      const smallBtc = ethers.parseUnits("0.0001", 8); // 10000 units
      const fee = await contract.calculateFee(await wbtc.getAddress(), 0, smallBtc);
      expect(fee).to.equal(BigInt(100));
    });

    it("owner can enable WETH minimum fee with pricing", async function () {
      // Assume 1 WETH = $2,500
      await contract.setTokenPricing(await weth.getAddress(), 2_500000000, true);
      const smallWeth = ethers.parseUnits("0.001", 18); // 1% = 0.00001 WETH
      const fee = await contract.calculateFee(await weth.getAddress(), 0, smallWeth);
      // $1.65 / $2500 = 0.00066 WETH
      expect(fee).to.equal(ethers.parseUnits("0.00066", 18));
    });

    it("RENT — WBTC large amount uses percentage", async function () {
      // 200 BTC rent → 1% = 2 BTC >> scaled minimum (1.65 BTC = 165_000000)
      const largeBtc = ethers.parseUnits("200", 8);
      const fee = await contract.calculateFee(await wbtc.getAddress(), 0, largeBtc);
      expect(fee).to.equal(ethers.parseUnits("2", 8));
    });

    it("DEAL — 0.25% fee with WBTC (8 decimals)", async function () {
      const amount = ethers.parseUnits("5", 8); // 5 BTC
      const fee = await contract.calculateFee(await wbtc.getAddress(), 1, amount);
      // 0.25% of 5 = 0.0125 BTC = 1_250000 (8 dec units)
      expect(fee).to.equal(ethers.parseUnits("0.0125", 8));
    });

    it("rejects fee calc for disabled token", async function () {
      await contract.setTokenEnabled(await usdt.getAddress(), false);
      await expect(contract.calculateFee(await usdt.getAddress(), 0, SMALL_RENT))
        .to.be.revertedWith("Token not accepted");
    });

    it("rejects fee calc for disabled payment type", async function () {
      await contract.setPaymentTypeEnabled(0, false); // disable RENT
      await expect(contract.calculateFee(await usdt.getAddress(), 0, SMALL_RENT))
        .to.be.revertedWith("Payment type disabled");
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  //  4 — Payment Processing (USDT — 6 decimals)
  // ═══════════════════════════════════════════════════════════════════

  describe("4 — Payments with USDT", function () {
    it("RENT — deducts principal + fee correctly", async function () {
      const ref = ethers.keccak256(ethers.toUtf8Bytes("rent-usdt-001"));
      const tenantBefore = await usdt.balanceOf(tenant.address);
      const recipBefore  = await usdt.balanceOf(recipient1.address);
      const pmBefore     = await usdt.balanceOf(propmetrik.address);

      const usdtAddr = await usdt.getAddress();
      await contract.connect(tenant).processPayment(usdtAddr, 0, ENTITY_ID_1, SMALL_RENT, ref, "0x");

      const fee = BigInt(1_650000); // minimum $1.65
      expect(await usdt.balanceOf(tenant.address)).to.equal(tenantBefore - SMALL_RENT - fee);
      expect(await usdt.balanceOf(recipient1.address)).to.equal(recipBefore + SMALL_RENT);
      expect(await usdt.balanceOf(propmetrik.address)).to.equal(pmBefore + fee);
    });

    it("DEAL — 0.25% fee split", async function () {
      const ref = ethers.keccak256(ethers.toUtf8Bytes("deal-usdt-001"));
      const usdtAddr = await usdt.getAddress();
      await contract.connect(tenant).processPayment(usdtAddr, 1, ENTITY_ID_1, DEAL_AMOUNT, ref, "0x");

      const fee = BigInt(25_000000);
      expect(await usdt.balanceOf(propmetrik.address)).to.equal(fee);
    });

    it("VALUATION — 2.5% fee split with USDT", async function () {
      const ref = ethers.keccak256(ethers.toUtf8Bytes("val-usdt-001"));
      const usdtAddr = await usdt.getAddress();
      const valAmount = ethers.parseUnits("5000", 6); // $5000 valuation
      await contract.connect(tenant).processPayment(usdtAddr, 3, ENTITY_ID_1, valAmount, ref, "0x");

      // 2.5% of 5000 = 125
      const fee = BigInt(125_000000);
      expect(await usdt.balanceOf(propmetrik.address)).to.equal(fee);
      expect(await usdt.balanceOf(recipient1.address)).to.equal(valAmount);
    });

    it("emits PaymentProcessed with token address", async function () {
      const ref = ethers.keccak256(ethers.toUtf8Bytes("emit-usdt-001"));
      const usdtAddr = await usdt.getAddress();
      await expect(
        contract.connect(tenant).processPayment(usdtAddr, 0, ENTITY_ID_1, SMALL_RENT, ref, "0x")
      )
        .to.emit(contract, "PaymentProcessed")
        .withArgs(ref, tenant.address, recipient1.address, usdtAddr, SMALL_RENT, 1_650000, 0);
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  //  5 — Payment Processing (USDC — 6 decimals)
  // ═══════════════════════════════════════════════════════════════════

  describe("5 — Payments with USDC", function () {
    it("RENT — works identically to USDT (same decimals)", async function () {
      const ref = ethers.keccak256(ethers.toUtf8Bytes("rent-usdc-001"));
      const usdcAddr = await usdc.getAddress();
      await contract.connect(tenant).processPayment(usdcAddr, 0, ENTITY_ID_1, SMALL_RENT, ref, "0x");

      expect(await usdc.balanceOf(recipient1.address)).to.equal(SMALL_RENT);
      expect(await usdc.balanceOf(propmetrik.address)).to.equal(BigInt(1_650000));
    });

    it("PROJECT — 0.25% fee", async function () {
      const ref = ethers.keccak256(ethers.toUtf8Bytes("proj-usdc-001"));
      const amount = ethers.parseUnits("20000", 6);
      const usdcAddr = await usdc.getAddress();
      await contract.connect(tenant).processPayment(usdcAddr, 2, ENTITY_ID_2, amount, ref, "0x");

      // 0.25% of 20000 = 50
      expect(await usdc.balanceOf(propmetrik.address)).to.equal(ethers.parseUnits("50", 6));
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  //  6 — Payment Processing (WETH — 18 decimals)
  // ═══════════════════════════════════════════════════════════════════

  describe("6 — Payments with WETH", function () {
    it("RENT — uses percentage for small amounts by default", async function () {
      const ref = ethers.keccak256(ethers.toUtf8Bytes("rent-weth-001"));
      const smallWeth = ethers.parseUnits("0.001", 18);
      const wethAddr = await weth.getAddress();

      await contract.connect(tenant).processPayment(wethAddr, 0, ENTITY_ID_1, smallWeth, ref, "0x");

      expect(await weth.balanceOf(propmetrik.address)).to.equal(ethers.parseUnits("0.00001", 18));
      expect(await weth.balanceOf(recipient1.address)).to.equal(smallWeth);
    });

    it("RENT — large amount uses 1% percentage", async function () {
      const ref = ethers.keccak256(ethers.toUtf8Bytes("rent-weth-002"));
      const largeWeth = ethers.parseUnits("200", 18);
      const wethAddr = await weth.getAddress();

      await contract.connect(tenant).processPayment(wethAddr, 0, ENTITY_ID_1, largeWeth, ref, "0x");

      // 1% of 200 = 2 WETH, which exceeds scaled minimum (1.65e18)
      expect(await weth.balanceOf(propmetrik.address)).to.equal(ethers.parseUnits("2", 18));
    });

    it("DEAL — 0.25% with 18 decimals", async function () {
      const ref = ethers.keccak256(ethers.toUtf8Bytes("deal-weth-001"));
      const amount = ethers.parseUnits("2", 18);
      const wethAddr = await weth.getAddress();

      await contract.connect(tenant).processPayment(wethAddr, 1, ENTITY_ID_1, amount, ref, "0x");

      // 0.25% of 2 = 0.005
      expect(await weth.balanceOf(propmetrik.address)).to.equal(ethers.parseUnits("0.005", 18));
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  //  7 — Payment Processing (WBTC — 8 decimals)
  // ═══════════════════════════════════════════════════════════════════

  describe("7 — Payments with WBTC", function () {
    it("RENT — uses percentage for small BTC amounts by default", async function () {
      const ref = ethers.keccak256(ethers.toUtf8Bytes("rent-wbtc-001"));
      const smallBtc = ethers.parseUnits("0.001", 8); // 0.001 BTC = 100000 units
      const wbtcAddr = await wbtc.getAddress();

      await contract.connect(tenant).processPayment(wbtcAddr, 0, ENTITY_ID_1, smallBtc, ref, "0x");

      // 1% of 0.001 = 0.00001 BTC = 1000 units
      expect(await wbtc.balanceOf(propmetrik.address)).to.equal(BigInt(1000));
      expect(await wbtc.balanceOf(recipient1.address)).to.equal(smallBtc);
    });

    it("RENT — large BTC amount uses 1% percentage", async function () {
      const ref = ethers.keccak256(ethers.toUtf8Bytes("rent-wbtc-002"));
      const largeBtc = ethers.parseUnits("200", 8); // 200 BTC
      const wbtcAddr = await wbtc.getAddress();

      await contract.connect(tenant).processPayment(wbtcAddr, 0, ENTITY_ID_1, largeBtc, ref, "0x");

      // 1% of 200 = 2 BTC >> scaledMin (1.65 BTC)
      expect(await wbtc.balanceOf(propmetrik.address)).to.equal(ethers.parseUnits("2", 8));
    });

    it("DEAL — 0.25% with 8 decimals", async function () {
      const ref = ethers.keccak256(ethers.toUtf8Bytes("deal-wbtc-001"));
      const amount = ethers.parseUnits("5", 8); // 5 BTC
      const wbtcAddr = await wbtc.getAddress();

      await contract.connect(tenant).processPayment(wbtcAddr, 1, ENTITY_ID_1, amount, ref, "0x");

      // 0.25% of 5 = 0.0125 BTC
      expect(await wbtc.balanceOf(propmetrik.address)).to.equal(ethers.parseUnits("0.0125", 8));
    });

    it("PROJECT — 0.25% with 8 decimals", async function () {
      const ref = ethers.keccak256(ethers.toUtf8Bytes("proj-wbtc-001"));
      const amount = ethers.parseUnits("1", 8); // 1 BTC
      const wbtcAddr = await wbtc.getAddress();

      await contract.connect(tenant).processPayment(wbtcAddr, 2, ENTITY_ID_2, amount, ref, "0x");

      // 0.25% of 1 = 0.0025 BTC
      expect(await wbtc.balanceOf(propmetrik.address)).to.equal(ethers.parseUnits("0.0025", 8));
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  //  7b — VALUATION Payments (PaymentType=3, 2.5% fee, all tokens)
  // ═══════════════════════════════════════════════════════════════════

  describe("7b — VALUATION Payments (2.5% fee)", function () {
    const VALUATION_USD = ethers.parseUnits("8000", 6); // $8000 valuation
    const VALUATION_ETH = ethers.parseUnits("4", 18);    // 4 WETH
    const VALUATION_BTC = ethers.parseUnits("0.1", 8);   // 0.1 WBTC

    it("VALUATION — USDC 2.5% fee and correct split", async function () {
      const ref = ethers.keccak256(ethers.toUtf8Bytes("val-usdc-001"));
      const usdcAddr = await usdc.getAddress();
      const tenantBefore = await usdc.balanceOf(tenant.address);

      await contract.connect(tenant).processPayment(usdcAddr, 3, ENTITY_ID_1, VALUATION_USD, ref, "0x");

      // 2.5% of 8000 = 200 USDC
      const fee = ethers.parseUnits("200", 6);
      expect(await usdc.balanceOf(propmetrik.address)).to.equal(fee);
      expect(await usdc.balanceOf(recipient1.address)).to.equal(VALUATION_USD);
      expect(await usdc.balanceOf(tenant.address)).to.equal(tenantBefore - VALUATION_USD - fee);
    });

    it("VALUATION — WETH 2.5% with 18 decimals", async function () {
      const ref = ethers.keccak256(ethers.toUtf8Bytes("val-weth-001"));
      const wethAddr = await weth.getAddress();

      await contract.connect(tenant).processPayment(wethAddr, 3, ENTITY_ID_1, VALUATION_ETH, ref, "0x");

      // 2.5% of 4 = 0.1 WETH
      expect(await weth.balanceOf(propmetrik.address)).to.equal(ethers.parseUnits("0.1", 18));
      expect(await weth.balanceOf(recipient1.address)).to.equal(VALUATION_ETH);
    });

    it("VALUATION — WBTC 2.5% with 8 decimals", async function () {
      const ref = ethers.keccak256(ethers.toUtf8Bytes("val-wbtc-001"));
      const wbtcAddr = await wbtc.getAddress();

      await contract.connect(tenant).processPayment(wbtcAddr, 3, ENTITY_ID_2, VALUATION_BTC, ref, "0x");

      // 2.5% of 0.1 = 0.0025 BTC = 250000 units
      expect(await wbtc.balanceOf(propmetrik.address)).to.equal(ethers.parseUnits("0.0025", 8));
      expect(await wbtc.balanceOf(recipient2.address)).to.equal(VALUATION_BTC);
    });

    it("VALUATION — emits PaymentProcessed with type 3", async function () {
      const ref = ethers.keccak256(ethers.toUtf8Bytes("val-emit-001"));
      const usdtAddr = await usdt.getAddress();
      const amount = ethers.parseUnits("2000", 6);

      await expect(
        contract.connect(tenant).processPayment(usdtAddr, 3, ENTITY_ID_1, amount, ref, "0x")
      )
        .to.emit(contract, "PaymentProcessed")
        .withArgs(ref, tenant.address, recipient1.address, usdtAddr, amount, ethers.parseUnits("50", 6), 3);
    });

    it("VALUATION — disabled type reverts", async function () {
      await contract.setPaymentTypeEnabled(3, false);
      const ref = ethers.keccak256(ethers.toUtf8Bytes("val-disabled-001"));
      await expect(
        contract.connect(tenant).processPayment(await usdt.getAddress(), 3, ENTITY_ID_1, VALUATION_USD, ref, "0x")
      ).to.be.revertedWith("Payment type disabled");
      await contract.setPaymentTypeEnabled(3, true); // restore
    });

    it("VALUATION — owner can update fee config", async function () {
      // Change VALUATION to 3% ($5 min)
      await contract.updateFeeConfig(3, 300, 5_000000);
      const cfg = await contract.feeConfigs(3);
      expect(cfg.percentageBasisPoints).to.equal(300);
      expect(cfg.minimumFeeUSD6).to.equal(5_000000);

      // 3% of $2000 = $60 USDT
      const fee = await contract.calculateFee(await usdt.getAddress(), 3, ethers.parseUnits("2000", 6));
      expect(fee).to.equal(ethers.parseUnits("60", 6));

      // Restore to 2.5%, $0 min
      await contract.updateFeeConfig(3, 250, 0);
    });

    it("VALUATION — gas usage within budget", async function () {
      const ref = ethers.keccak256(ethers.toUtf8Bytes("val-gas-001"));
      const usdtAddr = await usdt.getAddress();
      const tx = await contract.connect(tenant).processPayment(usdtAddr, 3, ENTITY_ID_1, VALUATION_USD, ref, "0x");
      const receipt = await tx.wait();
      expect(Number(receipt!.gasUsed)).to.be.lt(GAS_BUDGET);
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  //  8 — Cross-Token Mixed Payments
  // ═══════════════════════════════════════════════════════════════════

  describe("8 — Cross-Token Mixed Payments", function () {
    it("processes payments in 4 different tokens sequentially", async function () {
      const ref1 = ethers.keccak256(ethers.toUtf8Bytes("cross-001"));
      const ref2 = ethers.keccak256(ethers.toUtf8Bytes("cross-002"));
      const ref3 = ethers.keccak256(ethers.toUtf8Bytes("cross-003"));
      const ref4 = ethers.keccak256(ethers.toUtf8Bytes("cross-004"));

      const usdtAddr = await usdt.getAddress();
      const usdcAddr = await usdc.getAddress();
      const wethAddr = await weth.getAddress();
      const wbtcAddr = await wbtc.getAddress();

      await contract.connect(tenant).processPayment(usdtAddr, 0, ENTITY_ID_1, SMALL_RENT, ref1, "0x");
      await contract.connect(tenant).processPayment(usdcAddr, 1, ENTITY_ID_2, DEAL_AMOUNT, ref2, "0x");
      await contract.connect(tenant).processPayment(wethAddr, 2, ENTITY_ID_1, WETH_AMOUNT, ref3, "0x");
      await contract.connect(tenant).processPayment(wbtcAddr, 1, ENTITY_ID_2, WBTC_AMOUNT, ref4, "0x");

      // Verify each token landed correctly
      expect(await usdt.balanceOf(recipient1.address)).to.equal(SMALL_RENT);
      expect(await usdc.balanceOf(recipient2.address)).to.equal(DEAL_AMOUNT);
      expect(await weth.balanceOf(recipient1.address)).to.equal(WETH_AMOUNT);
      expect(await wbtc.balanceOf(recipient2.address)).to.equal(WBTC_AMOUNT);
    });

    it("recipient stats accumulate across 3 different tokens", async function () {
      const ref1 = ethers.keccak256(ethers.toUtf8Bytes("stats-001"));
      const ref2 = ethers.keccak256(ethers.toUtf8Bytes("stats-002"));
      const ref3 = ethers.keccak256(ethers.toUtf8Bytes("stats-003"));

      const usdtAddr = await usdt.getAddress();
      const wethAddr = await weth.getAddress();
      const wbtcAddr = await wbtc.getAddress();

      await contract.connect(tenant).processPayment(usdtAddr, 1, ENTITY_ID_1, DEAL_AMOUNT, ref1, "0x");
      await contract.connect(tenant).processPayment(wethAddr, 1, ENTITY_ID_1, WETH_AMOUNT, ref2, "0x");
      await contract.connect(tenant).processPayment(wbtcAddr, 1, ENTITY_ID_1, WBTC_AMOUNT, ref3, "0x");

      const [isActive, , paymentCount] = await contract.getRecipientProfile(recipient1.address);
      expect(isActive).to.be.true;
      expect(paymentCount).to.equal(3);
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  //  9 — Payment Validations
  // ═══════════════════════════════════════════════════════════════════

  describe("9 — Payment Validations", function () {
    it("rejects zero amount", async function () {
      const ref = ethers.keccak256(ethers.toUtf8Bytes("zero-001"));
      await expect(
        contract.connect(tenant).processPayment(await usdt.getAddress(), 0, ENTITY_ID_1, 0, ref, "0x")
      ).to.be.revertedWith("Amount must be > 0");
    });

    it("rejects unregistered token", async function () {
      const ref = ethers.keccak256(ethers.toUtf8Bytes("unreg-001"));
      await expect(
        contract.connect(tenant).processPayment(ethers.Wallet.createRandom().address, 0, ENTITY_ID_1, 100, ref, "0x")
      ).to.be.revertedWith("Token not accepted");
    });

    it("rejects disabled token", async function () {
      await contract.setTokenEnabled(await usdt.getAddress(), false);
      const ref = ethers.keccak256(ethers.toUtf8Bytes("disabled-001"));
      await expect(
        contract.connect(tenant).processPayment(await usdt.getAddress(), 0, ENTITY_ID_1, SMALL_RENT, ref, "0x")
      ).to.be.revertedWith("Token not accepted");
    });

    it("rejects disabled payment type", async function () {
      await contract.setPaymentTypeEnabled(0, false);
      const ref = ethers.keccak256(ethers.toUtf8Bytes("ptype-001"));
      await expect(
        contract.connect(tenant).processPayment(await usdt.getAddress(), 0, ENTITY_ID_1, SMALL_RENT, ref, "0x")
      ).to.be.revertedWith("Payment type disabled");
    });

    it("rejects unregistered recipient", async function () {
      const ref = ethers.keccak256(ethers.toUtf8Bytes("norec-001"));
      const fakeEntity = ethers.keccak256(ethers.toUtf8Bytes("fake-entity"));
      await expect(
        contract.connect(tenant).processPayment(await usdt.getAddress(), 0, fakeEntity, SMALL_RENT, ref, "0x")
      ).to.be.revertedWith("Recipient not registered");
    });

    it("rejects deactivated recipient", async function () {
      await contract.deactivateRecipient(ENTITY_ID_1);
      const ref = ethers.keccak256(ethers.toUtf8Bytes("deact-001"));
      await expect(
        contract.connect(tenant).processPayment(await usdt.getAddress(), 0, ENTITY_ID_1, SMALL_RENT, ref, "0x")
      ).to.be.revertedWith("Recipient not active");
    });

    it("rejects duplicate reference", async function () {
      const ref = ethers.keccak256(ethers.toUtf8Bytes("dup-001"));
      const usdtAddr = await usdt.getAddress();
      await contract.connect(tenant).processPayment(usdtAddr, 0, ENTITY_ID_1, SMALL_RENT, ref, "0x");
      await expect(
        contract.connect(tenant).processPayment(usdtAddr, 0, ENTITY_ID_1, SMALL_RENT, ref, "0x")
      ).to.be.revertedWith("Duplicate reference");
    });

    it("rejects when paused", async function () {
      await contract.pause();
      const ref = ethers.keccak256(ethers.toUtf8Bytes("paused-001"));
      await expect(
        contract.connect(tenant).processPayment(await usdt.getAddress(), 0, ENTITY_ID_1, SMALL_RENT, ref, "0x")
      ).to.be.revertedWithCustomError(contract, "EnforcedPause");
    });

    it("works again after unpause", async function () {
      await contract.pause();
      await contract.unpause();
      const ref = ethers.keccak256(ethers.toUtf8Bytes("unpaused-001"));
      await contract.connect(tenant).processPayment(await usdt.getAddress(), 0, ENTITY_ID_1, SMALL_RENT, ref, "0x");
      expect(await contract.isReferenceProcessed(ref)).to.be.true;
    });

    it("gas usage within budget", async function () {
      const ref = ethers.keccak256(ethers.toUtf8Bytes("gas-001"));
      const usdtAddr = await usdt.getAddress();
      const tx = await contract.connect(tenant).processPayment(usdtAddr, 0, ENTITY_ID_1, SMALL_RENT, ref, "0x");
      const receipt = await tx.wait();
      expect(Number(receipt!.gasUsed)).to.be.lt(GAS_BUDGET);
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // 10 — Recipient Management
  // ═══════════════════════════════════════════════════════════════════

  describe("10 — Recipient Management", function () {
    it("registers recipient correctly", async function () {
      const wallet = await contract.getRecipientWallet(ENTITY_ID_1);
      expect(wallet).to.equal(recipient1.address);
      const [isActive] = await contract.getRecipientProfile(recipient1.address);
      expect(isActive).to.be.true;
    });

    it("rejects duplicate entity registration", async function () {
      await expect(contract.registerRecipient(ENTITY_ID_1, recipient2.address))
        .to.be.revertedWith("Entity already registered");
    });

    it("rejects zero entity id", async function () {
      await expect(contract.registerRecipient(ethers.ZeroHash, recipient2.address))
        .to.be.revertedWith("Entity cannot be zero");
    });

    it("rejects wallet already assigned to another entity", async function () {
      const newEntity = ethers.keccak256(ethers.toUtf8Bytes("wallet-collision"));
      await expect(contract.registerRecipient(newEntity, recipient1.address))
        .to.be.revertedWith("Wallet already assigned");
    });

    it("rejects zero address wallet", async function () {
      const newEntity = ethers.keccak256(ethers.toUtf8Bytes("new-entity"));
      await expect(contract.registerRecipient(newEntity, ethers.ZeroAddress))
        .to.be.revertedWith("Wallet cannot be zero address");
    });

    it("only owner or registrar can register", async function () {
      const newEntity = ethers.keccak256(ethers.toUtf8Bytes("unauthorized"));
      await expect(contract.connect(tenant).registerRecipient(newEntity, tenant.address))
        .to.be.revertedWith("Not owner or registrar");
    });

    it("deactivates and reactivates recipient", async function () {
      await contract.deactivateRecipient(ENTITY_ID_1);
      let [isActive] = await contract.getRecipientProfile(recipient1.address);
      expect(isActive).to.be.false;

      await contract.reactivateRecipient(ENTITY_ID_1);
      [isActive] = await contract.getRecipientProfile(recipient1.address);
      expect(isActive).to.be.true;
    });

    it("updates recipient wallet and preserves history", async function () {
      // Process one payment first
      const ref = ethers.keccak256(ethers.toUtf8Bytes("pre-update-001"));
      await contract.connect(tenant).processPayment(await usdt.getAddress(), 1, ENTITY_ID_1, DEAL_AMOUNT, ref, "0x");

      const newWallet = ethers.Wallet.createRandom().address;
      await contract.updateRecipientWallet(ENTITY_ID_1, newWallet);

      // New wallet has the profile
      const [isActive, , paymentCount] = await contract.getRecipientProfile(newWallet);
      expect(isActive).to.be.true;
      expect(paymentCount).to.equal(1);

      // Old wallet is deactivated
      const [oldActive] = await contract.getRecipientProfile(recipient1.address);
      expect(oldActive).to.be.false;

      // Entity now points to new wallet
      expect(await contract.getRecipientWallet(ENTITY_ID_1)).to.equal(newWallet);
    });

    it("rejects same wallet update", async function () {
      await expect(contract.updateRecipientWallet(ENTITY_ID_1, recipient1.address))
        .to.be.revertedWith("Same wallet address");
    });

    it("rejects updating to wallet assigned to another entity", async function () {
      await expect(contract.updateRecipientWallet(ENTITY_ID_1, recipient2.address))
        .to.be.revertedWith("Wallet already assigned");
    });

    it("emits RecipientRegistered event", async function () {
      const newEntity = ethers.keccak256(ethers.toUtf8Bytes("event-entity"));
      const newWallet = ethers.Wallet.createRandom().address;
      await expect(contract.registerRecipient(newEntity, newWallet))
        .to.emit(contract, "RecipientRegistered")
        .withArgs(newEntity, newWallet);
    });

    // --- Registrar Role Tests ---

    it("authorized registrar can register a recipient", async function () {
      // Authorize tenant as a registrar
      await contract.authorizeRegistrar(tenant.address);
      expect(await contract.authorizedRegistrars(tenant.address)).to.be.true;

      const regEntity = ethers.keccak256(ethers.toUtf8Bytes("registrar-entity"));
      const regWallet = ethers.Wallet.createRandom().address;
      await expect(contract.connect(tenant).registerRecipient(regEntity, regWallet))
        .to.emit(contract, "RecipientRegistered")
        .withArgs(regEntity, regWallet);

      // Clean up: revoke
      await contract.revokeRegistrar(tenant.address);
    });

    it("authorized registrar can deactivate a recipient", async function () {
      await contract.authorizeRegistrar(tenant.address);
      // Register a new recipient first (as owner)
      const deactEntity = ethers.keccak256(ethers.toUtf8Bytes("deact-by-registrar"));
      const deactWallet = ethers.Wallet.createRandom().address;
      await contract.registerRecipient(deactEntity, deactWallet);

      // Registrar deactivates
      await contract.connect(tenant).deactivateRecipient(deactEntity);
      const [isActive] = await contract.getRecipientProfile(deactWallet);
      expect(isActive).to.be.false;

      await contract.revokeRegistrar(tenant.address);
    });

    it("revoked registrar cannot register", async function () {
      await contract.authorizeRegistrar(tenant.address);
      await contract.revokeRegistrar(tenant.address);

      const entity = ethers.keccak256(ethers.toUtf8Bytes("revoked-test"));
      await expect(contract.connect(tenant).registerRecipient(entity, tenant.address))
        .to.be.revertedWith("Not owner or registrar");
    });

    it("only owner can authorize a registrar", async function () {
      await expect(contract.connect(tenant).authorizeRegistrar(recipient1.address))
        .to.be.revertedWithCustomError(contract, "OwnableUnauthorizedAccount");
    });

    it("only owner can revoke a registrar", async function () {
      await contract.authorizeRegistrar(recipient1.address);
      await expect(contract.connect(tenant).revokeRegistrar(recipient1.address))
        .to.be.revertedWithCustomError(contract, "OwnableUnauthorizedAccount");
      await contract.revokeRegistrar(recipient1.address);
    });

    it("emits RegistrarAuthorized and RegistrarRevoked events", async function () {
      await expect(contract.authorizeRegistrar(tenant.address))
        .to.emit(contract, "RegistrarAuthorized")
        .withArgs(tenant.address);
      await expect(contract.revokeRegistrar(tenant.address))
        .to.emit(contract, "RegistrarRevoked")
        .withArgs(tenant.address);
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // 11 — Admin: Fee Config
  // ═══════════════════════════════════════════════════════════════════

  describe("11 — Fee Configuration", function () {
    it("updates fee config", async function () {
      await contract.updateFeeConfig(0, 200, 3_000000); // RENT: 2%, min $3
      const cfg = await contract.feeConfigs(0);
      expect(cfg.percentageBasisPoints).to.equal(200);
      expect(cfg.minimumFeeUSD6).to.equal(3_000000);
    });

    it("rejects basis points > 10000", async function () {
      await expect(contract.updateFeeConfig(0, 10001, 0))
        .to.be.revertedWith("Basis points cannot exceed 100%");
    });

    it("only owner can update fee config", async function () {
      await expect(contract.connect(tenant).updateFeeConfig(0, 50, 0))
        .to.be.revertedWithCustomError(contract, "OwnableUnauthorizedAccount");
    });

    it("emits FeeConfigUpdated event", async function () {
      await expect(contract.updateFeeConfig(1, 50, 1_000000))
        .to.emit(contract, "FeeConfigUpdated")
        .withArgs(1, 50, 1_000000);
    });

    it("can disable/enable payment types", async function () {
      await contract.setPaymentTypeEnabled(2, false); // PROJECT
      const cfg = await contract.feeConfigs(2);
      expect(cfg.enabled).to.be.false;

      await contract.setPaymentTypeEnabled(2, true);
      const cfg2 = await contract.feeConfigs(2);
      expect(cfg2.enabled).to.be.true;
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // 12 — Platform Wallet
  // ═══════════════════════════════════════════════════════════════════

  describe("12 — Platform Wallet", function () {
    it("updates platform wallet", async function () {
      const newWallet = ethers.Wallet.createRandom().address;
      await contract.updatePropmetrikWallet(newWallet);
      expect(await contract.propmetrikWallet()).to.equal(newWallet);
    });

    it("rejects zero address", async function () {
      await expect(contract.updatePropmetrikWallet(ethers.ZeroAddress))
        .to.be.revertedWith("Wallet cannot be zero address");
    });

    it("rejects same address", async function () {
      await expect(contract.updatePropmetrikWallet(propmetrik.address))
        .to.be.revertedWith("Same wallet address");
    });

    it("only owner can update", async function () {
      await expect(contract.connect(tenant).updatePropmetrikWallet(tenant.address))
        .to.be.revertedWithCustomError(contract, "OwnableUnauthorizedAccount");
    });

    it("emits PROPMETRIKWalletUpdated event", async function () {
      const newWallet = ethers.Wallet.createRandom().address;
      await expect(contract.updatePropmetrikWallet(newWallet))
        .to.emit(contract, "PROPMETRIKWalletUpdated")
        .withArgs(propmetrik.address, newWallet);
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // 13 — Ownership (2-Step)
  // ═══════════════════════════════════════════════════════════════════

  describe("13 — Ownable2Step", function () {
    it("initiates ownership transfer", async function () {
      await contract.transferOwnership(tenant.address);
      expect(await contract.pendingOwner()).to.equal(tenant.address);
      // Owner hasn't changed yet
      expect(await contract.owner()).to.equal(owner.address);
    });

    it("completes ownership transfer", async function () {
      await contract.transferOwnership(tenant.address);
      await contract.connect(tenant).acceptOwnership();
      expect(await contract.owner()).to.equal(tenant.address);
    });

    it("non-pending cannot accept", async function () {
      await contract.transferOwnership(tenant.address);
      await expect(contract.connect(recipient1).acceptOwnership())
        .to.be.revertedWithCustomError(contract, "OwnableUnauthorizedAccount");
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // 14 — View Functions
  // ═══════════════════════════════════════════════════════════════════

  describe("14 — View Functions", function () {
    it("isReferenceProcessed returns false then true", async function () {
      const ref = ethers.keccak256(ethers.toUtf8Bytes("view-001"));
      expect(await contract.isReferenceProcessed(ref)).to.be.false;
      await contract.connect(tenant).processPayment(await usdt.getAddress(), 0, ENTITY_ID_1, SMALL_RENT, ref, "0x");
      expect(await contract.isReferenceProcessed(ref)).to.be.true;
    });

    it("getRecipientProfile returns correct stats", async function () {
      const ref = ethers.keccak256(ethers.toUtf8Bytes("profile-001"));
      await contract.connect(tenant).processPayment(await usdt.getAddress(), 0, ENTITY_ID_1, SMALL_RENT, ref, "0x");

      const [isActive, totalReceived, paymentCount] = await contract.getRecipientProfile(recipient1.address);
      expect(isActive).to.be.true;
      expect(totalReceived).to.equal(SMALL_RENT);
      expect(paymentCount).to.equal(1);
    });

    it("tokenList returns ordered addresses", async function () {
      expect(await contract.tokenList(0)).to.equal(await usdt.getAddress());
      expect(await contract.tokenList(1)).to.equal(await usdc.getAddress());
      expect(await contract.tokenList(2)).to.equal(await weth.getAddress());
      expect(await contract.tokenList(3)).to.equal(await wbtc.getAddress());
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // 15 — Edge Cases & Security
  // ═══════════════════════════════════════════════════════════════════

  describe("15 — Edge Cases", function () {
    it("payment with zero fee (custom config)", async function () {
      await contract.updateFeeConfig(1, 0, 0); // DEAL: 0% fee
      const ref = ethers.keccak256(ethers.toUtf8Bytes("zero-fee-001"));
      const usdtAddr = await usdt.getAddress();
      await contract.connect(tenant).processPayment(usdtAddr, 1, ENTITY_ID_1, DEAL_AMOUNT, ref, "0x");

      expect(await usdt.balanceOf(propmetrik.address)).to.equal(0);
      expect(await usdt.balanceOf(recipient1.address)).to.equal(DEAL_AMOUNT);
    });

    it("handles very small amounts (1 unit)", async function () {
      const ref = ethers.keccak256(ethers.toUtf8Bytes("tiny-001"));
      const usdtAddr = await usdt.getAddress();
      const oneUnit = BigInt(1);
      // DEAL: 0.25% of 1 = 0 (rounds down)
      await contract.connect(tenant).processPayment(usdtAddr, 1, ENTITY_ID_1, oneUnit, ref, "0x");
      expect(await usdt.balanceOf(recipient1.address)).to.equal(oneUnit);
      expect(await usdt.balanceOf(propmetrik.address)).to.equal(0);
    });

    it("rejects using platform wallet as recipient", async function () {
      const selfEntity = ethers.keccak256(ethers.toUtf8Bytes("self-entity"));
      await expect(contract.registerRecipient(selfEntity, propmetrik.address))
        .to.be.revertedWith("Cannot use platform wallet");
    });

    it("adding a 5th token after deployment works", async function () {
      const MockF = await ethers.getContractFactory("MockERC20");
      const dai = await MockF.deploy("Mock DAI", "DAI", 18) as unknown as MockERC20;
      await contract.addToken(await dai.getAddress(), "DAI", 18);
      expect(await contract.getTokenCount()).to.equal(5);

      // Can process payment with new token
      await dai.mint(tenant.address, ethers.parseUnits("10000", 18));
      const contractAddr = await contract.getAddress();
      await dai.connect(tenant).approve(contractAddr, ethers.MaxUint256);

      const ref = ethers.keccak256(ethers.toUtf8Bytes("dai-001"));
      const amount = ethers.parseUnits("500", 18);
      await contract.connect(tenant).processPayment(await dai.getAddress(), 1, ENTITY_ID_1, amount, ref, "0x");
      expect(await dai.balanceOf(recipient1.address)).to.equal(amount);
    });

    it("removed token cannot be used for payment", async function () {
      await contract.removeToken(await usdc.getAddress());
      const ref = ethers.keccak256(ethers.toUtf8Bytes("removed-001"));
      await expect(
        contract.connect(tenant).processPayment(await usdc.getAddress(), 0, ENTITY_ID_1, SMALL_RENT, ref, "0x")
      ).to.be.revertedWith("Token not accepted");
    });
  });

  // ── 16 — Off-Chain Payment Attestation ────────────────────────────

  describe("16 — Off-Chain Payment Attestation", function () {
    let registrar: SignerWithAddress;

    beforeEach(async function () {
      registrar = recipient2; // reuse signer as registrar
      await contract.authorizeRegistrar(registrar.address);
    });

    const REF_OFFCHAIN_1 = ethers.keccak256(ethers.toUtf8Bytes("PM-RENT-UNIFIED-offchain-001"));
    const REF_OFFCHAIN_2 = ethers.keccak256(ethers.toUtf8Bytes("PM-RENT-UNIFIED-offchain-002"));

    const attestHash = (
      ref: string, entityId: string, paymentType: number,
      payCurrency: string, payChain: string, amountUsd6: bigint,
      payerAmountRaw: bigint, payerDecimals: number,
      outcomeCurrency: string, outcomeAmountRaw: bigint, outcomeDecimals: number,
      externalPaymentId: string, timestamp: number
    ) => {
      return ethers.keccak256(
        ethers.AbiCoder.defaultAbiCoder().encode(
          ["bytes32", "bytes32", "uint8", "string", "string", "uint256", "uint256", "uint8", "string", "uint256", "uint8", "string", "uint256"],
          [ref, entityId, paymentType, payCurrency, payChain, amountUsd6, payerAmountRaw, payerDecimals, outcomeCurrency, outcomeAmountRaw, outcomeDecimals, externalPaymentId, timestamp]
        )
      );
    };

    it("registrar can record off-chain payment", async function () {
      const hash = attestHash(
        REF_OFFCHAIN_1, ENTITY_ID_1, 0, "btc", "bitcoin", 100_000000n,
        15000000n, 8, "sol", 500000000n, 9, "12345678", 1700000000
      );

      await expect(
        contract.connect(registrar).recordOffChainPayment(
          REF_OFFCHAIN_1, ENTITY_ID_1, 0,
          "btc", "sol", 100_000000n,
          "12345678", hash, 1700000000
        )
      ).to.not.be.reverted;
    });

    it("emits OffChainPaymentAttested event", async function () {
      const hash = attestHash(
        REF_OFFCHAIN_1, ENTITY_ID_1, 0, "btc", "bitcoin", 100_000000n,
        15000000n, 8, "sol", 500000000n, 9, "12345678", 1700000000
      );

      await expect(
        contract.connect(registrar).recordOffChainPayment(
          REF_OFFCHAIN_1, ENTITY_ID_1, 0,
          "btc", "sol", 100_000000n,
          "12345678", hash, 1700000000
        )
      ).to.emit(contract, "OffChainPaymentAttested")
        .withArgs(REF_OFFCHAIN_1, ENTITY_ID_1, 0, hash, 100_000000n, "btc", "sol", "12345678", 1700000000);
    });

    it("owner can also record off-chain payment", async function () {
      const hash = attestHash(
        REF_OFFCHAIN_1, ENTITY_ID_1, 0, "eth", "ethereum", 500_000000n,
        250000000000000000n, 18, "usdt", 500_000000n, 6, "99999", 1700000001
      );

      await expect(
        contract.connect(owner).recordOffChainPayment(
          REF_OFFCHAIN_1, ENTITY_ID_1, 0,
          "eth", "usdt", 500_000000n,
          "99999", hash, 1700000001
        )
      ).to.not.be.reverted;
    });

    it("rejects non-registrar calling recordOffChainPayment", async function () {
      const hash = ethers.keccak256(ethers.toUtf8Bytes("dummy"));
      await expect(
        contract.connect(tenant).recordOffChainPayment(
          REF_OFFCHAIN_1, ENTITY_ID_1, 0,
          "btc", "sol", 100_000000n,
          "12345678", hash, 1700000000
        )
      ).to.be.revertedWith("Not owner or registrar");
    });

    it("rejects duplicate payment reference", async function () {
      const hash1 = attestHash(
        REF_OFFCHAIN_1, ENTITY_ID_1, 0, "btc", "bitcoin", 100_000000n,
        15000000n, 8, "sol", 500000000n, 9, "12345678", 1700000000
      );

      await contract.connect(registrar).recordOffChainPayment(
        REF_OFFCHAIN_1, ENTITY_ID_1, 0,
        "btc", "sol", 100_000000n,
        "12345678", hash1, 1700000000
      );

      await expect(
        contract.connect(registrar).recordOffChainPayment(
          REF_OFFCHAIN_1, ENTITY_ID_1, 0,
          "btc", "sol", 100_000000n,
          "12345678", hash1, 1700000000
        )
      ).to.be.revertedWith("Duplicate reference");
    });

    it("shares reference namespace with on-chain payments", async function () {
      // Use same reference for on-chain payment
      const ref = ethers.keccak256(ethers.toUtf8Bytes("shared-ref-001"));
      const contractAddr = await contract.getAddress();
      await usdt.connect(tenant).approve(contractAddr, ethers.MaxUint256);
      await contract.connect(tenant).processPayment(await usdt.getAddress(), 0, ENTITY_ID_1, SMALL_RENT, ref, "0x");

      // Attempt off-chain attestation with same reference should fail
      const hash = ethers.keccak256(ethers.toUtf8Bytes("dummy"));
      await expect(
        contract.connect(registrar).recordOffChainPayment(
          ref, ENTITY_ID_1, 0,
          "btc", "sol", 100_000000n,
          "12345678", hash, 1700000000
        )
      ).to.be.revertedWith("Duplicate reference");
    });

    it("rejects zero amount", async function () {
      const hash = ethers.keccak256(ethers.toUtf8Bytes("dummy"));
      await expect(
        contract.connect(registrar).recordOffChainPayment(
          REF_OFFCHAIN_1, ENTITY_ID_1, 0,
          "btc", "sol", 0n,
          "12345678", hash, 1700000000
        )
      ).to.be.revertedWith("Amount must be > 0");
    });

    it("rejects empty pay currency", async function () {
      const hash = ethers.keccak256(ethers.toUtf8Bytes("dummy"));
      await expect(
        contract.connect(registrar).recordOffChainPayment(
          REF_OFFCHAIN_1, ENTITY_ID_1, 0,
          "", "sol", 100_000000n,
          "12345678", hash, 1700000000
        )
      ).to.be.revertedWith("Pay currency required");
    });

    it("rejects empty external payment ID", async function () {
      const hash = ethers.keccak256(ethers.toUtf8Bytes("dummy"));
      await expect(
        contract.connect(registrar).recordOffChainPayment(
          REF_OFFCHAIN_1, ENTITY_ID_1, 0,
          "btc", "sol", 100_000000n,
          "", hash, 1700000000
        )
      ).to.be.revertedWith("External payment ID required");
    });

    it("rejects zero attestation hash", async function () {
      await expect(
        contract.connect(registrar).recordOffChainPayment(
          REF_OFFCHAIN_1, ENTITY_ID_1, 0,
          "btc", "sol", 100_000000n,
          "12345678", ethers.ZeroHash, 1700000000
        )
      ).to.be.revertedWith("Attestation hash required");
    });

    it("rejects when contract is paused", async function () {
      await contract.pause();
      const hash = ethers.keccak256(ethers.toUtf8Bytes("dummy"));
      await expect(
        contract.connect(registrar).recordOffChainPayment(
          REF_OFFCHAIN_1, ENTITY_ID_1, 0,
          "btc", "sol", 100_000000n,
          "12345678", hash, 1700000000
        )
      ).to.be.reverted;
      await contract.unpause();
    });

    it("increments offChainPaymentCount", async function () {
      expect(await contract.offChainPaymentCount()).to.equal(0);

      const hash1 = attestHash(
        REF_OFFCHAIN_1, ENTITY_ID_1, 0, "btc", "bitcoin", 100_000000n,
        15000000n, 8, "sol", 500000000n, 9, "12345678", 1700000000
      );
      await contract.connect(registrar).recordOffChainPayment(
        REF_OFFCHAIN_1, ENTITY_ID_1, 0, "btc", "sol", 100_000000n, "12345678", hash1, 1700000000
      );

      expect(await contract.offChainPaymentCount()).to.equal(1);

      const hash2 = attestHash(
        REF_OFFCHAIN_2, ENTITY_ID_1, 1, "eth", "ethereum", 200_000000n,
        100000000000000000n, 18, "usdt", 200_000000n, 6, "88888", 1700000002
      );
      await contract.connect(registrar).recordOffChainPayment(
        REF_OFFCHAIN_2, ENTITY_ID_1, 1, "eth", "usdt", 200_000000n, "88888", hash2, 1700000002
      );

      expect(await contract.offChainPaymentCount()).to.equal(2);
    });

    it("stores attestation hash and marks reference as processed", async function () {
      const hash = attestHash(
        REF_OFFCHAIN_1, ENTITY_ID_1, 0, "btc", "bitcoin", 100_000000n,
        15000000n, 8, "sol", 500000000n, 9, "12345678", 1700000000
      );

      await contract.connect(registrar).recordOffChainPayment(
        REF_OFFCHAIN_1, ENTITY_ID_1, 0, "btc", "sol", 100_000000n, "12345678", hash, 1700000000
      );

      // Reference is marked as processed
      expect(await contract.isReferenceProcessed(REF_OFFCHAIN_1)).to.be.true;

      // Attestation hash is stored
      expect(await contract.attestationHashes(REF_OFFCHAIN_1)).to.equal(hash);
    });

    it("verifyAttestation returns true for matching hash", async function () {
      const hash = attestHash(
        REF_OFFCHAIN_1, ENTITY_ID_1, 0, "btc", "bitcoin", 100_000000n,
        15000000n, 8, "sol", 500000000n, 9, "12345678", 1700000000
      );

      await contract.connect(registrar).recordOffChainPayment(
        REF_OFFCHAIN_1, ENTITY_ID_1, 0, "btc", "sol", 100_000000n, "12345678", hash, 1700000000
      );

      const [matches, storedHash] = await contract.verifyAttestation(REF_OFFCHAIN_1, hash);
      expect(matches).to.be.true;
      expect(storedHash).to.equal(hash);
    });

    it("verifyAttestation returns false for wrong hash", async function () {
      const hash = attestHash(
        REF_OFFCHAIN_1, ENTITY_ID_1, 0, "btc", "bitcoin", 100_000000n,
        15000000n, 8, "sol", 500000000n, 9, "12345678", 1700000000
      );

      await contract.connect(registrar).recordOffChainPayment(
        REF_OFFCHAIN_1, ENTITY_ID_1, 0, "btc", "sol", 100_000000n, "12345678", hash, 1700000000
      );

      const wrongHash = ethers.keccak256(ethers.toUtf8Bytes("tampered-data"));
      const [matches, storedHash] = await contract.verifyAttestation(REF_OFFCHAIN_1, wrongHash);
      expect(matches).to.be.false;
      expect(storedHash).to.equal(hash);
    });

    it("verifyAttestation returns false for non-existent reference", async function () {
      const fakeRef = ethers.keccak256(ethers.toUtf8Bytes("non-existent"));
      const [matches, storedHash] = await contract.verifyAttestation(fakeRef, ethers.keccak256(ethers.toUtf8Bytes("any")));
      expect(matches).to.be.false;
      expect(storedHash).to.equal(ethers.ZeroHash);
    });

    it("supports all payment types (RENT, DEAL, PROJECT, VALUATION)", async function () {
      for (const [i, type] of [0, 1, 2, 3].entries()) {
        const ref = ethers.keccak256(ethers.toUtf8Bytes(`offchain-type-${i}`));
        const hash = ethers.keccak256(ethers.toUtf8Bytes(`hash-${i}`));
        await expect(
          contract.connect(registrar).recordOffChainPayment(
            ref, ENTITY_ID_1, type, "btc", "sol", 100_000000n, `pay-${i}`, hash, 1700000000 + i
          )
        ).to.not.be.reverted;
      }
      expect(await contract.offChainPaymentCount()).to.equal(4);
    });

    it("gas usage within budget", async function () {
      const hash = attestHash(
        REF_OFFCHAIN_1, ENTITY_ID_1, 0, "btc", "bitcoin", 100_000000n,
        15000000n, 8, "sol", 500000000n, 9, "12345678", 1700000000
      );

      const tx = await contract.connect(registrar).recordOffChainPayment(
        REF_OFFCHAIN_1, ENTITY_ID_1, 0, "btc", "sol", 100_000000n, "12345678", hash, 1700000000
      );
      const receipt = await tx.wait();
      // Attestation should be cheap — mostly event emission + 2 storage writes
      expect(receipt!.gasUsed).to.be.lessThan(120_000);
    });
  });
});
