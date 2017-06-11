class BlockchainStore {
    static getPersistent() {
        return new PersistentBlockchainStore();
    }

    static createVolatile() {
        return new VolatileBlockchainStore();
    }

    static createTemporary(backend, transaction = false) {
        return new TemporaryBlockchainStore(backend, transaction);
    }
}

class PersistentBlockchainStore extends ObjectDB {
    constructor() {
        super('blocks', Chain);
    }

    async getMainChain() {
        const key = await ObjectDB.prototype.getString.call(this, 'main');
        if (!key) return undefined;
        return ObjectDB.prototype.getObject.call(this, key);
    }

    async setMainChain(mainChain) {
        const key = await this.key(mainChain);
        return await ObjectDB.prototype.putString.call(this, 'main', key);
    }
}

class VolatileBlockchainStore {
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

    getMainChain() {
        return this._mainChain;
    }

    setMainChain(chain) {
        this._mainChain = chain;
    }
}

class TemporaryBlockchainStore{
    constructor(backend, transaction = false) {
        this._backend = backend;
        this._store = {};
        this._removed = {};
        this._transaction = transaction;
    }

    async key(value) {
        return (await value.hash()).toBase64();
    }

    async get(key) {
        // First try to find the key in our local store.
        if (this._store[key] === undefined) {
            // If it is not in there, get it from our backend.
            const value = await this._backend.get(key);
            // Undefined values in the backend are cached by null.
            // However to be consistent with the other implementations,
            // we return undefined.
            if (!value) {
                this._store[key] = null;
                return undefined;
            }
            // Assignment is intended! Cache value.
            // unserialize(serialize) copies node.
            return this._store[key] = Block.unserialize(value.serialize());
        }
        return this._store[key] === null ? undefined : this._store[key];
    }

    async put(value) {
        if (!value) {
            Log.w(TemporaryBlockchainStore, 'Can\'t store null or undefined object.');
            return value;
        }
        const key = await this.key(value);
        this._store[key] = value;
        return key;
    }

    async remove(value) {
        if (!value) return value;
        const key = await this.key(value);
        this._removed[key] = value;
        this._store[key] = null;
        return key;
    }

    async commit() {
        if (!this._transaction) return;
        // Update backend with all our changes.
        // We also update cached values to ensure a consistent state with our view.
        let tx = this._backend;
        if (tx.transaction) {
            let txx = await tx.transaction();
            if (!(txx instanceof TemporaryBlockchainStore)) {
                tx = txx;
            }
        }
        for (let key of Object.keys(this._store)) {
            if (this._store[key] === null) {
                await tx.remove(this._removed[key]); // eslint-disable-line no-await-in-loop
            } else {
                await tx.put(this._store[key]); // eslint-disable-line no-await-in-loop
            }
        }
        if (this._mainChain !== undefined) {
            await tx.setMainChain(this._mainChain);
        }
        if (tx.commit) await tx.commit();
        this._mainChain = null;
        this._removed = {};
        this._store = {};
    }

    transaction() {
        return new TemporaryAccountsTreeStore(this, true);
    }

    async getMainChain() {
        if (this._mainChain === undefined) {
            this._mainChain = (await this._backend.getMainChain()) || null;
        }
        return this._mainChain === null ? undefined : this._mainChain;
    }

    setMainChain(chain) {
        this._mainChain = chain;
    }
}

Class.register(BlockchainStore);
