class ProofchainStore {
    static getPersistent() {
        return new PersistentProofchainStore();
    }

    static createVolatile() {
        return new VolatileProofchainStore();
    }
}

class PersistentProofchainStore extends ObjectDB {
    constructor() {
        super('headers', BlockHeader);
    }

    async getMainHead() {
        const key = await ObjectDB.prototype.getString.call(this, 'main');
        if (!key) return undefined;
        return ObjectDB.prototype.getObject.call(this, key);
    }

    async setMainHead(mainChain) {
        const key = await this.key(mainChain);
        return await ObjectDB.prototype.putString.call(this, 'main', key);
    }

    cleanMainHead() {
        return ObjectDB.prototype.remove.call(this, 'main');
    }
}

class VolatileProofchainStore {
    constructor() {
        this._store = {};
        this._mainChain = null;
    }

    async key(value) {
        return (await value.hash()).toBase64();
    }

    get(key) {
        return this._store[key];
    }

    async put(value) {
        const key = await this.key(value);
        this._store[key] = value;
        return key;
    }

    async remove(value) {
        const key = await this.key(value);
        delete this._store[key];
    }

    getMainHead() {
        return this._mainChain;
    }

    setMainHead(chain) {
        this._mainChain = chain;
    }

    cleanMainHead() {
        this._mainChain = null;
        return true;
    }

}
Class.register(ProofchainStore);
