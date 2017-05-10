class WorkerBuilder {
    add() {
        return this;
    }

    main() {
        return this;
    }

    build() {
        return new MockWorker();
    }
}
Class.register(WorkerBuilder);

class MockWorker {
    constructor() {
        this._scope = new MockWorkerScope();
        this._scope.on('message', msg => {
            if (this._onmessage) {
                this._onmessage(msg);
            }
        });

        this._worker = MiningWorker.init(this._scope);
    }

    postMessage(msg) {
        if (this._scope.onmessage) {
            const header = BlockHeader.unserialize(msg.serialize());
            this._scope.onmessage({data: header});
        }
    }

    set onmessage(fn) {
        this._onmessage = fn;
    }
}

class MockWorkerScope extends Observable {
    constructor() {
        super();
    }

    postMessage(msg) {
        this.fire('message', {data: msg});
    }

    setTimeout(fn, wait) {
        return setTimeout(fn, wait);
    }

    clearTimeout(hnd) {
        return clearTimeout(hnd);
    }

    setInterval(fn, wait) {
        return setInterval(fn, wait);
    }

    clearInterval(hnd) {
        return clearInterval(hnd);
    }

    get onmessage() {
        return this._onmessage;
    }

    set onmessage(fn) {
        this._onmessage = fn;
    }
}
