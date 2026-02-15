import { expect } from "chai";
import { ethers } from "hardhat";
import {
  PROPMETRIKPayments,
  MockERC20,
  MockSwapRouter,
} from "../typechain-types";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

describe("PROPMETRIKPayments — Swap / Auto-Conversion", function () {
  let contract: PROPMETRIKPayments;
  let mockRouter: MockSwapRouter;
  let usdt: MockERC20;
  let usdc: MockERC20;
  let weth: MockERC20;
  let wbtc: MockERC20;
  let owner: SignerWithAddress;
  let tenant: SignerWithAddress;
  let propmetrik: SignerWithAddress;
  let recipient1: SignerWithAddress;
  let recipient2: SignerWithAddress;
  let registrar: SignerWithAddress;

  const ENTITY_ID_1 = ethers.keccak256(ethers.toUtf8Bytes("swap-entity-001"));
  const ENTITY_ID_2 = ethers.keccak256(ethers.toUtf8Bytes("swap-entity-002"));

  const RENT_1000 = ethers.parseUnits("1000", 6);   // $1000 USDT
  const RENT_500  = ethers.parseUnits("500", 6);     // $500 USDC
  const WETH_1    = ethers.parseUnits("1", 18);       // 1 WETH

  function makeRef(label: string): string {
    return ethers.keccak256(ethers.toUtf8Bytes(label));
  }

  beforeEach(async function () {
    [owner, tenant, propmetrik, recipient1, recipient2, registrar] = await ethers.getSigners();

    // Deploy mock tokens
    const MockERC20Factory = await ethers.getContractFactory("MockERC20");
    usdt = await MockERC20Factory.deploy("Mock USDT", "USDT", 6) as unknown as MockERC20;
    usdc = await MockERC20Factory.deploy("Mock USDC", "USDC", 6) as unknown as MockERC20;
    weth = await MockERC20Factory.deploy("Mock WETH", "WETH", 18) as unknown as MockERC20;
    wbtc = await MockERC20Factory.deploy("Mock WBTC", "WBTC", 8) as unknown as MockERC20;

    // Deploy mock swap router
    const MockSwapRouterFactory = await ethers.getContractFactory("MockSwapRouter");
    mockRouter = await MockSwapRouterFactory.deploy() as unknown as MockSwapRouter;

    // Deploy payment contract
    const PaymentsFactory = await ethers.getContractFactory("PROPMETRIKPayments");
    contract = await PaymentsFactory.deploy(propmetrik.address, owner.address) as unknown as PROPMETRIKPayments;

    // Add tokens
    await contract.addToken(await usdt.getAddress(), "USDT", 6);
    await contract.addToken(await usdc.getAddress(), "USDC", 6);
    await contract.addToken(await weth.getAddress(), "WETH", 18);
    await contract.addToken(await wbtc.getAddress(), "WBTC", 8);

    // Set swap router
    await contract.setSwapRouter(await mockRouter.getAddress());

    // Authorize registrar
    await contract.authorizeRegistrar(registrar.address);

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

    // Pre-fund the mock router with output tokens (it needs tokens to "swap" with)
    const routerAddr = await mockRouter.getAddress();
    await usdt.mint(routerAddr, ethers.parseUnits("10000000", 6));
    await usdc.mint(routerAddr, ethers.parseUnits("10000000", 6));
    await weth.mint(routerAddr, ethers.parseUnits("10000", 18));
    await wbtc.mint(routerAddr, ethers.parseUnits("10000", 8));

    // Register recipients
    await contract.registerRecipient(ENTITY_ID_1, recipient1.address);
    await contract.registerRecipient(ENTITY_ID_2, recipient2.address);
  });

  // ═══════════════════════════════════════════════════════════════
  //  1 — Swap Configuration
  // ═══════════════════════════════════════════════════════════════

  describe("1 — Swap Configuration", function () {
    it("sets swap router correctly", async function () {
      expect(await contract.swapRouter()).to.equal(await mockRouter.getAddress());
    });

    it("only owner can set swap router", async function () {
      await expect(
        contract.connect(tenant).setSwapRouter(ethers.ZeroAddress)
      ).to.be.revertedWithCustomError(contract, "OwnableUnauthorizedAccount");
    });

    it("emits SwapRouterUpdated event", async function () {
      const newAddr = recipient1.address; // any non-zero address
      const oldAddr = await mockRouter.getAddress();
      await expect(contract.setSwapRouter(newAddr))
        .to.emit(contract, "SwapRouterUpdated")
        .withArgs(oldAddr, newAddr);
    });

    it("can disable swap router by setting to zero", async function () {
      await contract.setSwapRouter(ethers.ZeroAddress);
      expect(await contract.swapRouter()).to.equal(ethers.ZeroAddress);
    });

    it("defaults swap fee tier to 3000", async function () {
      expect(await contract.defaultSwapFeeTier()).to.equal(3000);
    });

    it("sets default swap fee tier", async function () {
      await contract.setDefaultSwapFeeTier(500);
      expect(await contract.defaultSwapFeeTier()).to.equal(500);
    });

    it("emits DefaultSwapFeeTierUpdated event", async function () {
      await expect(contract.setDefaultSwapFeeTier(500))
        .to.emit(contract, "DefaultSwapFeeTierUpdated")
        .withArgs(3000, 500);
    });

    it("rejects invalid fee tier", async function () {
      await expect(contract.setDefaultSwapFeeTier(0)).to.be.revertedWith("Invalid fee tier");
      await expect(contract.setDefaultSwapFeeTier(100001)).to.be.revertedWith("Invalid fee tier");
    });

    it("sets pair-specific fee tier", async function () {
      const usdtAddr = await usdt.getAddress();
      const usdcAddr = await usdc.getAddress();
      await contract.setPairSwapFeeTier(usdtAddr, usdcAddr, 500);
      expect(await contract.getSwapFeeTier(usdtAddr, usdcAddr)).to.equal(500);
    });

    it("falls back to default tier when no pair tier set", async function () {
      const usdtAddr = await usdt.getAddress();
      const wethAddr = await weth.getAddress();
      expect(await contract.getSwapFeeTier(usdtAddr, wethAddr)).to.equal(3000);
    });

    it("sets max swap slippage", async function () {
      await contract.setMaxSwapSlippage(50);
      expect(await contract.maxSwapSlippageBps()).to.equal(50);
    });

    it("rejects slippage out of range", async function () {
      await expect(contract.setMaxSwapSlippage(0)).to.be.revertedWith("Slippage 1-1000 bps");
      await expect(contract.setMaxSwapSlippage(1001)).to.be.revertedWith("Slippage 1-1000 bps");
    });

    it("only owner can set swap config", async function () {
      await expect(
        contract.connect(tenant).setDefaultSwapFeeTier(500)
      ).to.be.revertedWithCustomError(contract, "OwnableUnauthorizedAccount");
      await expect(
        contract.connect(tenant).setMaxSwapSlippage(50)
      ).to.be.revertedWithCustomError(contract, "OwnableUnauthorizedAccount");
    });
  });

  // ═══════════════════════════════════════════════════════════════
  //  2 — Recipient Preferred Token
  // ═══════════════════════════════════════════════════════════════

  describe("2 — Recipient Preferred Token", function () {
    it("sets recipient preferred token via registrar", async function () {
      const usdcAddr = await usdc.getAddress();
      await contract.connect(registrar).setRecipientPreferredToken(ENTITY_ID_1, usdcAddr);
      expect(await contract.recipientPreferredTokens(ENTITY_ID_1)).to.equal(usdcAddr);
    });

    it("sets recipient preferred token via owner", async function () {
      const usdtAddr = await usdt.getAddress();
      await contract.setRecipientPreferredToken(ENTITY_ID_1, usdtAddr);
      expect(await contract.recipientPreferredTokens(ENTITY_ID_1)).to.equal(usdtAddr);
    });

    it("emits RecipientPreferredTokenSet event", async function () {
      const wethAddr = await weth.getAddress();
      await expect(contract.setRecipientPreferredToken(ENTITY_ID_1, wethAddr))
        .to.emit(contract, "RecipientPreferredTokenSet")
        .withArgs(ENTITY_ID_1, wethAddr);
    });

    it("clears preference by setting to zero address", async function () {
      const usdcAddr = await usdc.getAddress();
      await contract.setRecipientPreferredToken(ENTITY_ID_1, usdcAddr);
      await contract.setRecipientPreferredToken(ENTITY_ID_1, ethers.ZeroAddress);
      expect(await contract.recipientPreferredTokens(ENTITY_ID_1)).to.equal(ethers.ZeroAddress);
    });

    it("rejects non-registrar setting preference", async function () {
      const usdcAddr = await usdc.getAddress();
      await expect(
        contract.connect(tenant).setRecipientPreferredToken(ENTITY_ID_1, usdcAddr)
      ).to.be.revertedWith("Not owner or registrar");
    });

    it("rejects preference for unregistered entity", async function () {
      const unknownEntity = ethers.keccak256(ethers.toUtf8Bytes("nobody"));
      await expect(
        contract.setRecipientPreferredToken(unknownEntity, await usdc.getAddress())
      ).to.be.revertedWith("Entity not registered");
    });

    it("rejects non-accepted token as preference", async function () {
      const fakeToken = ethers.Wallet.createRandom().address;
      await expect(
        contract.setRecipientPreferredToken(ENTITY_ID_1, fakeToken)
      ).to.be.revertedWith("Preferred token not accepted");
    });
  });

  // ═══════════════════════════════════════════════════════════════
  //  3 — processPaymentWithSwap — No Swap Needed (fallback)
  // ═══════════════════════════════════════════════════════════════

  describe("3 — processPaymentWithSwap — Direct (no swap)", function () {
    it("behaves like processPayment when no preferred token set", async function () {
      const ref = makeRef("direct-no-pref-001");
      const principal = RENT_1000;
      const fee = await contract.calculateFee(await usdt.getAddress(), 0, principal);

      const r1Before = await usdt.balanceOf(recipient1.address);
      const pmBefore = await usdt.balanceOf(propmetrik.address);

      await contract.connect(tenant).processPaymentWithSwap(
        {
          token: await usdt.getAddress(),
          paymentType: 0,
          recipientEntityId: ENTITY_ID_1,
          principalAmount: principal,
          paymentReference: ref,
          amountOutMinimum: 0,
        },
        "0x"
      );

      expect(await usdt.balanceOf(recipient1.address)).to.equal(r1Before + principal);
      expect(await usdt.balanceOf(propmetrik.address)).to.equal(pmBefore + fee);
      expect(await contract.isReferenceProcessed(ref)).to.be.true;
    });

    it("behaves like processPayment when preferred token == payment token", async function () {
      const usdtAddr = await usdt.getAddress();
      await contract.setRecipientPreferredToken(ENTITY_ID_1, usdtAddr);

      const ref = makeRef("direct-same-token-001");
      const principal = RENT_500;

      const r1Before = await usdt.balanceOf(recipient1.address);
      await contract.connect(tenant).processPaymentWithSwap(
        {
          token: usdtAddr,
          paymentType: 0,
          recipientEntityId: ENTITY_ID_1,
          principalAmount: principal,
          paymentReference: ref,
          amountOutMinimum: 0,
        },
        "0x"
      );

      expect(await usdt.balanceOf(recipient1.address)).to.equal(r1Before + principal);
    });

    it("falls back to direct when swap router is zero", async function () {
      // Set a preferred token AND clear the router
      const usdcAddr = await usdc.getAddress();
      await contract.setRecipientPreferredToken(ENTITY_ID_1, usdcAddr);
      await contract.setSwapRouter(ethers.ZeroAddress);

      const ref = makeRef("direct-no-router-001");
      const usdtAddr = await usdt.getAddress();
      const principal = RENT_500;

      // Should do a direct USDT transfer (not swap to USDC) since router is zero
      const r1Before = await usdt.balanceOf(recipient1.address);
      await contract.connect(tenant).processPaymentWithSwap(
        {
          token: usdtAddr,
          paymentType: 0,
          recipientEntityId: ENTITY_ID_1,
          principalAmount: principal,
          paymentReference: ref,
          amountOutMinimum: 0,
        },
        "0x"
      );

      // Recipient gets USDT directly (not USDC)
      expect(await usdt.balanceOf(recipient1.address)).to.equal(r1Before + principal);
    });

    it("emits PaymentProcessed on direct fallback", async function () {
      const ref = makeRef("direct-event-001");
      const usdtAddr = await usdt.getAddress();
      const principal = RENT_500;
      const fee = await contract.calculateFee(usdtAddr, 0, principal);

      await expect(
        contract.connect(tenant).processPaymentWithSwap(
          {
            token: usdtAddr,
            paymentType: 0,
            recipientEntityId: ENTITY_ID_1,
            principalAmount: principal,
            paymentReference: ref,
            amountOutMinimum: 0,
          },
          "0x"
        )
      )
        .to.emit(contract, "PaymentProcessed")
        .withArgs(ref, tenant.address, recipient1.address, usdtAddr, principal, fee, 0);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  //  4 — processPaymentWithSwap — With Swap
  // ═══════════════════════════════════════════════════════════════

  describe("4 — processPaymentWithSwap — With Swap", function () {
    let usdtAddr: string;
    let usdcAddr: string;
    let wethAddr: string;

    beforeEach(async function () {
      usdtAddr = await usdt.getAddress();
      usdcAddr = await usdc.getAddress();
      wethAddr = await weth.getAddress();

      // Set recipient1 to prefer USDC
      await contract.setRecipientPreferredToken(ENTITY_ID_1, usdcAddr);

      // Set stablecoin pair fee tier to 500 (0.05%)
      await contract.setPairSwapFeeTier(usdtAddr, usdcAddr, 500);
    });

    it("swaps USDT → USDC successfully (1:1 stablecoin)", async function () {
      const ref = makeRef("swap-usdt-usdc-001");
      const principal = RENT_1000; // 1000 USDT
      const fee = await contract.calculateFee(usdtAddr, 0, principal);

      const r1UsdcBefore = await usdc.balanceOf(recipient1.address);
      const pmUsdtBefore = await usdt.balanceOf(propmetrik.address);

      await contract.connect(tenant).processPaymentWithSwap(
        {
          token: usdtAddr,
          paymentType: 0,
          recipientEntityId: ENTITY_ID_1,
          principalAmount: principal,
          paymentReference: ref,
          amountOutMinimum: 0,
        },
        "0x"
      );

      // Recipient gets USDC (swapped)
      const r1UsdcAfter = await usdc.balanceOf(recipient1.address);
      expect(r1UsdcAfter - r1UsdcBefore).to.equal(principal); // 1:1 rate

      // Platform gets fee in original token (USDT)
      const pmUsdtAfter = await usdt.balanceOf(propmetrik.address);
      expect(pmUsdtAfter - pmUsdtBefore).to.equal(fee);

      // Reference is marked
      expect(await contract.isReferenceProcessed(ref)).to.be.true;
    });

    it("emits PaymentProcessedWithSwap event", async function () {
      const ref = makeRef("swap-event-001");
      const principal = RENT_500;
      const fee = await contract.calculateFee(usdtAddr, 0, principal);

      await expect(
        contract.connect(tenant).processPaymentWithSwap(
          {
            token: usdtAddr,
            paymentType: 0,
            recipientEntityId: ENTITY_ID_1,
            principalAmount: principal,
            paymentReference: ref,
            amountOutMinimum: 0,
          },
          "0x"
        )
      )
        .to.emit(contract, "PaymentProcessedWithSwap")
        .withArgs(
          ref,
          tenant.address,
          recipient1.address,
          usdtAddr,
          usdcAddr,
          principal,
          principal, // 1:1 swap, amountOut == principal
          fee,
          0 // RENT
        );
    });

    it("swaps WETH → USDC (cross-decimal, 18 → 6)", async function () {
      // Set recipient2 to prefer USDC
      await contract.setRecipientPreferredToken(ENTITY_ID_2, usdcAddr);

      // Set a rate: 1 WETH = 2000 USDC (rate = 2000e18)
      await mockRouter.setRate(wethAddr, usdcAddr, ethers.parseEther("2000"));

      const ref = makeRef("swap-weth-usdc-001");
      const principal = ethers.parseUnits("1", 18); // 1 WETH
      const fee = await contract.calculateFee(wethAddr, 0, principal);

      const r2UsdcBefore = await usdc.balanceOf(recipient2.address);

      await contract.connect(tenant).processPaymentWithSwap(
        {
          token: wethAddr,
          paymentType: 0,
          recipientEntityId: ENTITY_ID_2,
          principalAmount: principal,
          paymentReference: ref,
          amountOutMinimum: ethers.parseUnits("1900", 6), // min 1900 USDC
        },
        "0x"
      );

      // Should receive ~2000 USDC
      const r2UsdcAfter = await usdc.balanceOf(recipient2.address);
      expect(r2UsdcAfter - r2UsdcBefore).to.equal(ethers.parseUnits("2000", 6));
    });

    it("handles DEAL payment type (0.25% fee) with swap", async function () {
      const ref = makeRef("swap-deal-001");
      const principal = ethers.parseUnits("10000", 6); // 10k USDT
      const fee = await contract.calculateFee(usdtAddr, 1, principal); // DEAL = 0.25%
      expect(fee).to.equal(ethers.parseUnits("25", 6)); // 25 USDT

      const r1UsdcBefore = await usdc.balanceOf(recipient1.address);
      const pmUsdtBefore = await usdt.balanceOf(propmetrik.address);

      await contract.connect(tenant).processPaymentWithSwap(
        {
          token: usdtAddr,
          paymentType: 1, // DEAL
          recipientEntityId: ENTITY_ID_1,
          principalAmount: principal,
          paymentReference: ref,
          amountOutMinimum: 0,
        },
        "0x"
      );

      expect(await usdc.balanceOf(recipient1.address)).to.equal(r1UsdcBefore + principal);
      expect(await usdt.balanceOf(propmetrik.address)).to.equal(pmUsdtBefore + fee);
    });

    it("contract does not retain any tokens after swap", async function () {
      const ref = makeRef("swap-no-residual-001");
      const principal = RENT_1000;
      const contractAddr = await contract.getAddress();

      const contractUsdtBefore = await usdt.balanceOf(contractAddr);
      const contractUsdcBefore = await usdc.balanceOf(contractAddr);

      await contract.connect(tenant).processPaymentWithSwap(
        {
          token: usdtAddr,
          paymentType: 0,
          recipientEntityId: ENTITY_ID_1,
          principalAmount: principal,
          paymentReference: ref,
          amountOutMinimum: 0,
        },
        "0x"
      );

      // Contract should not hold any tokens
      expect(await usdt.balanceOf(contractAddr)).to.equal(contractUsdtBefore);
      expect(await usdc.balanceOf(contractAddr)).to.equal(contractUsdcBefore);
    });

    it("rejects when slippage protection is violated", async function () {
      // Set router slippage to 2% (200 bps)
      await mockRouter.setSlippage(200);

      const ref = makeRef("swap-slippage-fail-001");
      const principal = RENT_1000;

      // Request minimum output that's higher than what we'll get after 2% slippage
      const minOut = principal; // demand 100% output, but we'll only get 98%
      await expect(
        contract.connect(tenant).processPaymentWithSwap(
          {
            token: usdtAddr,
            paymentType: 0,
            recipientEntityId: ENTITY_ID_1,
            principalAmount: principal,
            paymentReference: ref,
            amountOutMinimum: minOut,
          },
          "0x"
        )
      ).to.be.revertedWith("MockSwapRouter: insufficient output");
    });

    it("rejects when preferred token is disabled", async function () {
      // Disable USDC
      await contract.setTokenEnabled(usdcAddr, false);

      const ref = makeRef("swap-disabled-pref-001");
      await expect(
        contract.connect(tenant).processPaymentWithSwap(
          {
            token: usdtAddr,
            paymentType: 0,
            recipientEntityId: ENTITY_ID_1,
            principalAmount: RENT_500,
            paymentReference: ref,
            amountOutMinimum: 0,
          },
          "0x"
        )
      ).to.be.revertedWith("Preferred token disabled");
    });

    it("updates recipient stats with swapped amount", async function () {
      const ref = makeRef("swap-stats-001");
      const principal = RENT_1000;

      await contract.connect(tenant).processPaymentWithSwap(
        {
          token: usdtAddr,
          paymentType: 0,
          recipientEntityId: ENTITY_ID_1,
          principalAmount: principal,
          paymentReference: ref,
          amountOutMinimum: 0,
        },
        "0x"
      );

      const profile = await contract.getRecipientProfile(recipient1.address);
      expect(profile.paymentCount).to.equal(1);
      // totalReceived should reflect the swapped output amount
      expect(profile.totalReceived).to.equal(principal); // 1:1 rate
    });
  });

  // ═══════════════════════════════════════════════════════════════
  //  5 — processPaymentWithSwap — Validation
  // ═══════════════════════════════════════════════════════════════

  describe("5 — processPaymentWithSwap — Validation", function () {
    it("rejects zero amount", async function () {
      const ref = makeRef("swap-zero-001");
      await expect(
        contract.connect(tenant).processPaymentWithSwap(
          {
            token: await usdt.getAddress(),
            paymentType: 0,
            recipientEntityId: ENTITY_ID_1,
            principalAmount: 0,
            paymentReference: ref,
            amountOutMinimum: 0,
          },
          "0x"
        )
      ).to.be.revertedWith("Amount must be > 0");
    });

    it("rejects unaccepted token", async function () {
      const fakeToken = ethers.Wallet.createRandom().address;
      const ref = makeRef("swap-bad-token-001");
      await expect(
        contract.connect(tenant).processPaymentWithSwap(
          {
            token: fakeToken,
            paymentType: 0,
            recipientEntityId: ENTITY_ID_1,
            principalAmount: RENT_500,
            paymentReference: ref,
            amountOutMinimum: 0,
          },
          "0x"
        )
      ).to.be.revertedWith("Token not accepted");
    });

    it("rejects disabled payment type", async function () {
      await contract.setPaymentTypeEnabled(0, false); // disable RENT
      const ref = makeRef("swap-disabled-type-001");
      await expect(
        contract.connect(tenant).processPaymentWithSwap(
          {
            token: await usdt.getAddress(),
            paymentType: 0,
            recipientEntityId: ENTITY_ID_1,
            principalAmount: RENT_500,
            paymentReference: ref,
            amountOutMinimum: 0,
          },
          "0x"
        )
      ).to.be.revertedWith("Payment type disabled");
    });

    it("rejects unregistered recipient", async function () {
      const unknownEntity = ethers.keccak256(ethers.toUtf8Bytes("unknown-swap"));
      const ref = makeRef("swap-unknown-001");
      await expect(
        contract.connect(tenant).processPaymentWithSwap(
          {
            token: await usdt.getAddress(),
            paymentType: 0,
            recipientEntityId: unknownEntity,
            principalAmount: RENT_500,
            paymentReference: ref,
            amountOutMinimum: 0,
          },
          "0x"
        )
      ).to.be.revertedWith("Recipient not registered");
    });

    it("rejects duplicate payment reference", async function () {
      const ref = makeRef("swap-dup-001");
      const usdtAddr = await usdt.getAddress();

      // First payment
      await contract.connect(tenant).processPaymentWithSwap(
        {
          token: usdtAddr,
          paymentType: 0,
          recipientEntityId: ENTITY_ID_1,
          principalAmount: RENT_500,
          paymentReference: ref,
          amountOutMinimum: 0,
        },
        "0x"
      );

      // Duplicate
      await expect(
        contract.connect(tenant).processPaymentWithSwap(
          {
            token: usdtAddr,
            paymentType: 0,
            recipientEntityId: ENTITY_ID_1,
            principalAmount: RENT_500,
            paymentReference: ref,
            amountOutMinimum: 0,
          },
          "0x"
        )
      ).to.be.revertedWith("Duplicate reference");
    });

    it("rejects when paused", async function () {
      await contract.pause();
      const ref = makeRef("swap-paused-001");
      await expect(
        contract.connect(tenant).processPaymentWithSwap(
          {
            token: await usdt.getAddress(),
            paymentType: 0,
            recipientEntityId: ENTITY_ID_1,
            principalAmount: RENT_500,
            paymentReference: ref,
            amountOutMinimum: 0,
          },
          "0x"
        )
      ).to.be.revertedWithCustomError(contract, "EnforcedPause");
    });

    it("shares reference namespace with processPayment", async function () {
      const ref = makeRef("shared-ref-001");
      const usdtAddr = await usdt.getAddress();

      // Pay via processPayment first
      await contract.connect(tenant).processPayment(usdtAddr, 0, ENTITY_ID_1, RENT_500, ref, "0x");

      // Try same ref via processPaymentWithSwap
      await expect(
        contract.connect(tenant).processPaymentWithSwap(
          {
            token: usdtAddr,
            paymentType: 0,
            recipientEntityId: ENTITY_ID_1,
            principalAmount: RENT_500,
            paymentReference: ref,
            amountOutMinimum: 0,
          },
          "0x"
        )
      ).to.be.revertedWith("Duplicate reference");
    });
  });

  // ═══════════════════════════════════════════════════════════════
  //  6 — Token Rescue
  // ═══════════════════════════════════════════════════════════════

  describe("6 — Token Rescue", function () {
    it("owner can rescue stuck tokens", async function () {
      const contractAddr = await contract.getAddress();
      const usdtAddr = await usdt.getAddress();
      const amount = ethers.parseUnits("100", 6);

      // Send tokens directly to contract (simulating stuck funds)
      await usdt.mint(contractAddr, amount);

      const ownerBefore = await usdt.balanceOf(owner.address);
      await contract.rescueTokens(usdtAddr, owner.address, amount);
      expect(await usdt.balanceOf(owner.address)).to.equal(ownerBefore + amount);
    });

    it("rejects non-owner rescue", async function () {
      await expect(
        contract.connect(tenant).rescueTokens(
          await usdt.getAddress(),
          tenant.address,
          ethers.parseUnits("100", 6)
        )
      ).to.be.revertedWithCustomError(contract, "OwnableUnauthorizedAccount");
    });

    it("rejects rescue to zero address", async function () {
      await expect(
        contract.rescueTokens(await usdt.getAddress(), ethers.ZeroAddress, 1)
      ).to.be.revertedWith("Cannot rescue to zero address");
    });
  });

  // ═══════════════════════════════════════════════════════════════
  //  7 — Platform Fee Auto-Conversion
  // ═══════════════════════════════════════════════════════════════

  describe("7 — Platform Fee Auto-Conversion", function () {

    it("setPlatformPreferredToken works", async function () {
      await contract.setPlatformPreferredToken(await usdc.getAddress());
      expect(await contract.platformPreferredToken()).to.equal(await usdc.getAddress());
    });

    it("emits PlatformPreferredTokenSet event", async function () {
      const usdcAddr = await usdc.getAddress();
      await expect(contract.setPlatformPreferredToken(usdcAddr))
        .to.emit(contract, "PlatformPreferredTokenSet")
        .withArgs(ethers.ZeroAddress, usdcAddr);
    });

    it("only owner can set platform preferred token", async function () {
      await expect(
        contract.connect(tenant).setPlatformPreferredToken(await usdc.getAddress())
      ).to.be.revertedWithCustomError(contract, "OwnableUnauthorizedAccount");
    });

    it("rejects unaccepted token", async function () {
      await expect(
        contract.setPlatformPreferredToken(tenant.address) // not a token
      ).to.be.revertedWith("Preferred token not accepted");
    });

    it("can clear preference by setting to zero", async function () {
      await contract.setPlatformPreferredToken(await usdc.getAddress());
      await contract.setPlatformPreferredToken(ethers.ZeroAddress);
      expect(await contract.platformPreferredToken()).to.equal(ethers.ZeroAddress);
    });

    it("processPayment: fee stays in payer token when no preference set", async function () {
      // No preferred token set — fee should go in USDT
      const usdtAddr = await usdt.getAddress();
      const ref = makeRef("plat-fee-no-pref-001");
      const platformBalBefore = await usdt.balanceOf(propmetrik.address);

      await contract.connect(tenant).processPayment(usdtAddr, 0, ENTITY_ID_1, RENT_1000, ref, "0x");

      const platformBalAfter = await usdt.balanceOf(propmetrik.address);
      const feeReceived = platformBalAfter - platformBalBefore;
      // 1% of 1000 USDT = 10 USDT, but minimum is $1.65, so use percentage
      expect(feeReceived).to.equal(ethers.parseUnits("10", 6));
    });

    it("processPayment: fee auto-converts to platform preferred token", async function () {
      // Set platform preference to USDC
      const usdcAddr = await usdc.getAddress();
      const usdtAddr = await usdt.getAddress();
      await contract.setPlatformPreferredToken(usdcAddr);

      const ref = makeRef("plat-fee-convert-001");
      const platformUsdcBefore = await usdc.balanceOf(propmetrik.address);
      const platformUsdtBefore = await usdt.balanceOf(propmetrik.address);

      await contract.connect(tenant).processPayment(usdtAddr, 0, ENTITY_ID_1, RENT_1000, ref, "0x");

      // Platform should receive USDC (converted), not USDT
      const platformUsdtAfter = await usdt.balanceOf(propmetrik.address);
      const platformUsdcAfter = await usdc.balanceOf(propmetrik.address);

      // USDT balance unchanged — fee was swapped
      expect(platformUsdtAfter).to.equal(platformUsdtBefore);
      // USDC balance increased (mock router does 1:1 for same-decimal tokens)
      expect(platformUsdcAfter - platformUsdcBefore).to.be.gt(0);
    });

    it("processPayment: no swap when paying in same token as preference", async function () {
      const usdtAddr = await usdt.getAddress();
      await contract.setPlatformPreferredToken(usdtAddr);

      const ref = makeRef("plat-fee-same-001");
      const platformBalBefore = await usdt.balanceOf(propmetrik.address);

      await contract.connect(tenant).processPayment(usdtAddr, 0, ENTITY_ID_1, RENT_1000, ref, "0x");

      const feeReceived = (await usdt.balanceOf(propmetrik.address)) - platformBalBefore;
      expect(feeReceived).to.equal(ethers.parseUnits("10", 6)); // Direct, no swap
    });

    it("processPaymentWithSwap (direct path): fee auto-converts", async function () {
      // Set platform pref to USDC, pay in USDT, NO recipient swap
      const usdcAddr = await usdc.getAddress();
      const usdtAddr = await usdt.getAddress();
      await contract.setPlatformPreferredToken(usdcAddr);

      const ref = makeRef("plat-fee-swap-direct-001");
      const platformUsdcBefore = await usdc.balanceOf(propmetrik.address);

      await contract.connect(tenant).processPaymentWithSwap(
        { token: usdtAddr, paymentType: 0, recipientEntityId: ENTITY_ID_1, principalAmount: RENT_1000, paymentReference: ref, amountOutMinimum: 0 },
        "0x"
      );

      const platformUsdcAfter = await usdc.balanceOf(propmetrik.address);
      expect(platformUsdcAfter - platformUsdcBefore).to.be.gt(0);
    });

    it("processPaymentWithSwap (swap path): fee auto-converts", async function () {
      // Recipient prefers USDC, platform prefers WETH
      const usdcAddr = await usdc.getAddress();
      const usdtAddr = await usdt.getAddress();
      const wethAddr = await weth.getAddress();

      await contract.connect(registrar).setRecipientPreferredToken(ENTITY_ID_1, usdcAddr);
      await contract.setPlatformPreferredToken(wethAddr);

      // Set WETH pricing so swap test has context
      await contract.setTokenPricing(wethAddr, ethers.parseUnits("2500", 6), true);

      const ref = makeRef("plat-fee-swap-swap-001");
      const platformWethBefore = await weth.balanceOf(propmetrik.address);
      const platformUsdtBefore = await usdt.balanceOf(propmetrik.address);

      await contract.connect(tenant).processPaymentWithSwap(
        { token: usdtAddr, paymentType: 0, recipientEntityId: ENTITY_ID_1, principalAmount: RENT_1000, paymentReference: ref, amountOutMinimum: 0 },
        "0x"
      );

      const platformWethAfter = await weth.balanceOf(propmetrik.address);
      const platformUsdtAfter = await usdt.balanceOf(propmetrik.address);

      // Fee should arrive as WETH, not USDT
      expect(platformWethAfter - platformWethBefore).to.be.gt(0);
      expect(platformUsdtAfter).to.equal(platformUsdtBefore);
    });

    it("falls back to direct fee when swap router is zero", async function () {
      const usdcAddr = await usdc.getAddress();
      const usdtAddr = await usdt.getAddress();

      await contract.setPlatformPreferredToken(usdcAddr);
      await contract.setSwapRouter(ethers.ZeroAddress);

      const ref = makeRef("plat-fee-no-router-001");
      const platformUsdtBefore = await usdt.balanceOf(propmetrik.address);

      await contract.connect(tenant).processPayment(usdtAddr, 0, ENTITY_ID_1, RENT_1000, ref, "0x");

      // Fee goes in USDT (no swap router available)
      const feeReceived = (await usdt.balanceOf(propmetrik.address)) - platformUsdtBefore;
      expect(feeReceived).to.equal(ethers.parseUnits("10", 6));
    });

    it("contract does not retain any tokens after platform fee swap", async function () {
      const usdcAddr = await usdc.getAddress();
      const usdtAddr = await usdt.getAddress();
      await contract.setPlatformPreferredToken(usdcAddr);

      const ref = makeRef("plat-fee-no-retain-001");
      const contractAddr = await contract.getAddress();

      await contract.connect(tenant).processPayment(usdtAddr, 0, ENTITY_ID_1, RENT_1000, ref, "0x");

      // Contract should hold zero of both tokens
      expect(await usdt.balanceOf(contractAddr)).to.equal(0);
      expect(await usdc.balanceOf(contractAddr)).to.equal(0);
    });

    it("DEAL fee (0.25%) auto-converts correctly", async function () {
      const usdcAddr = await usdc.getAddress();
      const usdtAddr = await usdt.getAddress();
      await contract.setPlatformPreferredToken(usdcAddr);

      const ref = makeRef("plat-fee-deal-001");
      const platformUsdcBefore = await usdc.balanceOf(propmetrik.address);

      // DEAL payment: 0.25% of 1000 = 2.5 USDT → should become ~2.5 USDC
      await contract.connect(tenant).processPayment(usdtAddr, 1, ENTITY_ID_1, RENT_1000, ref, "0x");

      const feeConverted = (await usdc.balanceOf(propmetrik.address)) - platformUsdcBefore;
      expect(feeConverted).to.be.gt(0);
    });
  });

});
