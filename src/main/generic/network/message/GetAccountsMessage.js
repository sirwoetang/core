class GetAccountsMessage extends Message {
    constructor(addresses) {
        super(Message.Type.GETACCOUNTS);
        if (!addresses || !NumberUtils.isUint16(addresses.length)
            || addresses.some(it => !(it instanceof Address))) throw 'Malformed addresses';
        this._addresses = addresses;
    }

    static unserialize(buf) {
        Message.unserialize(buf);
        const count = buf.readUint16();
        const addresses = [];
        for (let i = 0; i < count; i++) {
            addresses.push(Address.unserialize(buf));
        }
        return new GetAccountsMessage(addresses);
    }

    serialize(buf) {
        buf = buf || new SerialBuffer(this.serializedSize);
        super.serialize(buf);
        buf.writeUint16(this._addresses.length);
        for (const address of this._addresses) {
            address.serialize(buf);
        }
        super._setChecksum(buf);
        return buf;
    }

    get serializedSize() {
        let size = super.serializedSize
            + /*count*/ 2;
        for (const hash of this._addresses) {
            size += hash.serializedSize;
        }
        return size;
    }

    get addresses() {
        return this._addresses;
    }
}
Class.register(GetAccountsMessage);
