const { expect } = require("chai"); const { ethers } = require("hardhat");
describe("FinovaAnchor", () => {
  const key = ethers.id("circle-1"), h1 = ethers.id("r1"), h2 = ethers.id("r2");
  async function setup() { const [owner, other] = await ethers.getSigners(); const c = await (await ethers.getContractFactory("FinovaAnchor")).deploy(); return { c, owner, other }; }
  it("owner anchors and reads back", async () => { const { c } = await setup();
    await expect(c.anchor(key, 1, h1)).to.emit(c, "Anchored").withArgs(key, 1, h1);
    expect(await c.count(key)).to.equal(1n); expect((await c.latest(key)).recordHash).to.equal(h1); });
  it("rejects a non-owner", async () => { const { c, other } = await setup(); await expect(c.connect(other).anchor(key, 1, h1)).to.be.revertedWithCustomError(c, "NotOwner"); });
  it("rejects non-increasing seq", async () => { const { c } = await setup(); await c.anchor(key, 2, h1); await expect(c.anchor(key, 2, h2)).to.be.revertedWithCustomError(c, "SeqNotIncreasing"); });
  it("transfers ownership in two steps", async () => { const { c, other } = await setup(); await c.transferOwnership(other.address); await c.connect(other).acceptOwnership(); expect(await c.owner()).to.equal(other.address); });
});
