class Core {
    constructor(behavior = Core.Behavior.Full) {
        return this._init(behavior);
    }

    async _init(behavior) {
        // Model
        this.accounts = await Accounts.getPersistent();
        this.blockchain = await Blockchain.getPersistent(this.accounts);
        this.mempool = new Mempool(this.blockchain, this.accounts);

        // Network
        this.network = await new Network(this.blockchain);

        // Consensus
        this.consensus = new Consensus(this.blockchain, this.mempool, this.network, behavior);

        // Wallet
        this.wallet = await Wallet.getPersistent();

        // Miner
        this.miner = new Miner(this.blockchain, this.mempool, this.wallet.address);

        Object.freeze(this);
        return this;
    }
}
Core.Behavior = {
    Full: 0,
    Mini: 1,
    Nano: 2
};
Class.register(Core);
