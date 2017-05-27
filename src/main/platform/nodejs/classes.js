global.Class = {
    register: clazz => {
        global[clazz.prototype.constructor.name] = clazz;
    }
};

require('../../generic/utils/Observable.js');
require('../../generic/utils/Services.js');
require('../../generic/utils/Synchronizer.js');
require('../../generic/utils/Timers.js');
require('../../generic/utils/database/TypedDBTransaction.js');
require('./database/TypedDB.js');
require('../../generic/utils/database/ObjectDB.js');
require('../../generic/utils/array/IndexedArray.js');
require('../../generic/utils/array/ArrayUtils.js');
require('../../generic/utils/buffer/SerialBuffer.js');
require('../../generic/utils/buffer/BufferUtils.js');
require('./crypto/CryptoLib.js');
require('../../generic/utils/crypto/Crypto.js');
require('../../generic/utils/number/NumberUtils.js');
require('../../generic/utils/object/ObjectUtils.js');
require('../../generic/utils/platform/PlatformUtils.js');
require('../../generic/utils/string/StringUtils.js');
require('../../generic/consensus/Policy.js');
require('../../generic/consensus/primitive/Primitive.js');
require('../../generic/consensus/primitive/Hash.js');
require('../../generic/consensus/primitive/PrivateKey.js');
require('../../generic/consensus/primitive/PublicKey.js');
require('../../generic/consensus/primitive/Signature.js');
require('../../generic/consensus/account/Accounts.js');
require('../../generic/consensus/account/AccountsTree.js');
require('../../generic/consensus/account/AccountsTreeStore.js');
require('../../generic/consensus/account/Address.js');
require('../../generic/consensus/account/Balance.js');
require('../../generic/consensus/block/BlockUtils.js');
require('../../generic/consensus/block/BlockBody.js');
require('../../generic/consensus/block/BlockHeader.js');
require('../../generic/consensus/block/Block.js');
require('../../generic/consensus/blockchain/Blockchain.js');
require('../../generic/consensus/blockchain/BlockchainStore.js');
require('../../generic/consensus/transaction/Transaction.js');
require('../../generic/consensus/mempool/Mempool.js');
require('../../generic/consensus/ConsensusAgent.js');
require('../../generic/consensus/Consensus.js');
require('../../generic/network/address/PeerAddress.js');
require('../../generic/network/message/Message.js');
require('../../generic/network/message/AddrMessage.js');
require('../../generic/network/message/BlockMessage.js');
require('../../generic/network/message/GetAddrMessage.js');
require('../../generic/network/message/GetBlocksMessage.js');
require('../../generic/network/message/InventoryMessage.js');
require('../../generic/network/message/MempoolMessage.js');
require('../../generic/network/message/PingMessage.js');
require('../../generic/network/message/PongMessage.js');
require('../../generic/network/message/RejectMessage.js');
require('../../generic/network/message/SignalMessage.js');
require('../../generic/network/message/TxMessage.js');
require('../../generic/network/message/VerAckMessage.js');
require('../../generic/network/message/VersionMessage.js');
require('../../generic/network/message/MessageFactory.js');
require('./network/webrtc/WebRtcConnector.js');
require('./network/websocket/WebSocketConnector.js');
require('./network/NetworkConfig.js');
require('../../generic/network/PeerConnection.js');
require('../../generic/network/PeerChannel.js');
require('../../generic/network/PeerAddresses.js');
require('../../generic/network/Peer.js');
require('../../generic/network/NetworkAgent.js');
require('../../generic/network/Network.js');
require('../../generic/miner/Miner.js');
require('./wallet/WalletStore.js');
require('../../generic/wallet/Wallet.js');
require('./utils/WindowDetector.js');
require('../../generic/Core.js');
