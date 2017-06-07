class AccountsMessage extends Message {
    constructor(nodes) {
        super(Message.Type.ACCOUNTS);
        if (!nodes || !NumberUtils.isUint16(nodes.length)
            || nodes.some(it => !(it instanceof AccountsTreeNode))
            || nodes.length > AccountsMessage.LENGTH_MAX) throw 'Malformed nodes';
        this._nodes = nodes;
    }

    static unserialize(buf) {
        Message.unserialize(buf);
        const count = buf.readUint16();
        const nodes = [];
        for (let i = 0; i < count; ++i) {
            nodes.push(AccountsTreeNode.unserialize(buf));
        }
        return new AccountsMessage(nodes);
    }

    serialize(buf) {
        buf = buf || new SerialBuffer(this.serializedSize);
        super.serialize(buf);
        buf.writeUint16(this._nodes.length);
        for (const node of this._nodes) {
            node.serialize(buf);
        }
        super._setChecksum(buf);
        return buf;
    }

    get serializedSize() {
        let size = super.serializedSize
            + /*count*/ 2;
        for (const node of this._nodes) {
            size += node.serializedSize;
        }
        return size;
    }

    get nodes() {
        return this._nodes;
    }
}
AccountsMessage.LENGTH_MAX = 500;
Class.register(AccountsMessage);
