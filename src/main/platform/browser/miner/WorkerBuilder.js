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
		// Put it the source into a blob.
		// TODO Blob backwards compatbility (BlobBuilder)
		const blob = new Blob([source], {type: 'application/javascript'});

		// Create a object url for the blob.
		const objUrl = (window.URL ? URL : webkitURL).createObjectURL(blob);

		// Create the webworker.
		return new Worker(objUrl);
    }
}
