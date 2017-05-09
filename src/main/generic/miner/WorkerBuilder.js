class WorkerBuilder {
    constructor() {
        this._code = '';
    }

    static _toString(fn) {
        return fn.toString()
            .replace('"use strict";', '');
    }

    add(arg) {
        if (typeof arg !== 'string') {
            arg = WorkerBuilder._toString(arg);
        }
        this._code += arg;
        return this;
    }

    main(fn) {
        this._code += '(function ' + WorkerBuilder._toString(fn) + ')();';
        return this;
    }

    build() {
        return this._code;
    }
}
