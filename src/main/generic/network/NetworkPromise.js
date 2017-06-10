class NetworkPromise {
    constructor(channel) {
        this._channel = channel;
        this._listener = null;
    }

    get channel() {
        return this._channel;
    }

    _on(resolve, reject, type, checker) {
        const that = this;
        const timeout = setTimeout(() => {
            that._channel.removeListener(that._listener);
            reject();
        }, 5000);
        this._listener = async msg => {
            if (await checker(msg)) {
                that._channel.removeListener(that._listener);
                clearTimeout(timeout);
                resolve(msg);
            }
        };
        this._channel.on(type, this._listener);
    }

    on(type, checker) {
        return new Promise((resolve, reject) => this._on(resolve, reject, type, checker));
    }

    getblock(hash) {
        const inv = new InvVector(InvVector.Type.BLOCK, hash);
        const p = this.on('block', async msg => {
            const msgHash = await msg.block.hash();
            return hash.equals(msgHash);
        });
        this._channel.getdata([inv]);
        return p;
    }

    ping(nonce) {
        const p = this.on('pong', msg => msg.nonce === nonce);
        this._channel.ping(nonce);
        return p;
    }

    getaccount(address) {
        const p = this.on('accounts', msg => msg.nodes.length > 0 && msg.nodes[msg.nodes.length - 1].prefix === address.toHex());
        this._channel.getaccounts([address]);
        return p;
    }
}
Class.register(NetworkPromise);
