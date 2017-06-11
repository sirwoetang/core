class GetAccountsMessage extends Message {
    constructor(addresses, height) {
        super(Message.Type.GETACCOUNTS);
        if (!addresses || !NumberUtils.isUint16(addresses.length)
            || addresses.some(it => !(it instanceof Address))) throw 'Malformed addresses';
        if (!NumberUtils.isUint32(height)) throw 'Malformed height';
        this._addresses = addresses;
        this._height = height;
    }

    static unserialize(buf) {
        Message.unserialize(buf);
        const height = buf.readUint32();
        const count = buf.readUint16();
        const addresses = [];
        for (let i = 0; i < count; i++) {
            addresses.push(Address.unserialize(buf));
        }
        return new GetAccountsMessage(addresses, height);
    }

    serialize(buf) {
        buf = buf || new SerialBuffer(this.serializedSize);
        super.serialize(buf);
        buf.writeUint32(this._height);
        buf.writeUint16(this._addresses.length);
        for (const address of this._addresses) {
            address.serialize(buf);
        }
        super._setChecksum(buf);
        return buf;
    }

    get serializedSize() {
        let size = super.serializedSize
            + /*height*/ 4
            + /*count*/ 2;
        for (const hash of this._addresses) {
            size += hash.serializedSize;
        }
        return size;
    }

    get addresses() {
        return this._addresses;
    }

    get height() {
        return this._height;
    }
}
Class.register(GetAccountsMessage);
