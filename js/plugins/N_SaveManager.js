/*:
 * @plugindesc v1.0.6 Save files asynchronously and use deflate compression.
 * @author Think_Nathan, Gilad Dayagi
 */

// Setup localforage
localforage.config({
    name: 'Save',
    driver: localforage.LOCALSTORAGE
});


/**
 * pakoWorker
 * Promise-based wrapper for a worker
 * that compresses and decompresses strings
 *
 * @methods
 *   compress({String})
 *   terminate()
 *
 * @credit Template by Gilad Dayagi
 * =====================================================
 */
(function () {
    const resolves = {};
    const rejects = {};
    let globalMsgId = 0;

    // Activate calculation in the worker, returning a promise
    function sendMsg(payload, worker) {
        const msgId = globalMsgId++;
        const msg = {
            id: msgId,
            payload,
        }
        return new Promise(function (resolve, reject) {
            // save callbacks for later
            resolves[msgId] = resolve;
            rejects[msgId] = reject;
            worker.postMessage(msg);
        })
    };

    // Handle incoming calculation result
    function handleMsg(msg) {
        const {
            id,
            err,
            payload,
        } = msg.data;
        if (payload) {
            const resolve = resolves[id];
            if (resolve) {
                resolve(payload);
            }
        } else {
            // error condition
            const reject = rejects[id];
            if (reject) {
                if (err) {
                    reject(err);
                } else {
                    reject('Got nothing');
                }
            }
        }

        // purge used callbacks
        delete resolves[id];
        delete rejects[id];
    };

    /**
     * Web worker that interfaces with Pako
     * Returns a compressed string
     * Template by Gilad Dayagi
     */
    function workerScript() {
        importScripts(location.hash.substring(1, location.hash.length));

        // Compresses a string
        async function deflateString(data, cb) {
            let result = null,
                err = null;

            if (typeof data === 'string') {
                const compressed = await pako.deflate(data, {
                    to: "string",
                    level: 1
                });
                const encoded = btoa(compressed);
                result = encoded;
            } else {
                err = 'Not a string';
            }

            const delay = Math.ceil(Math.random() * 1000);
            setTimeout(function () {
                cb(err, result);
            }, delay);
        };

        // Decompresses a string
        async function inflateString(data, cb) {
            let result = null,
                err = null;

            if (typeof data === 'string') {
                const decoded = atob(data);
                const decompressed = await pako.inflate(decoded, {
                    to: "string"
                });
                result = decompressed;
            } else {
                err = 'Not a string';
            }

            const delay = Math.ceil(Math.random() * 1000);
            setTimeout(function () {
                cb(err, result);
            }, delay);
        };

        // Handle incoming messages
        self.onmessage = function (msg) {
            const {
                id,
                payload
            } = msg.data;
            const type = payload.requestType;
            const data = payload.data;

            if (type === 'compress') {
                deflateString(data, function (err, result) {
                    const msg = {
                        id,
                        err,
                        payload: result
                    }
                    self.postMessage(msg);
                });
            } else if (type === 'decompress') {
                inflateString(data, function (err, result) {
                    const msg = {
                        id,
                        err,
                        payload: result
                    }
                    self.postMessage(msg);
                });
            }

        };
    };

    // Wrapper class
    class pakoWorker {
        constructor() {
            // Sets up the worker as a blob
            // Also sends the URL to import the Pako library
            var location = window.location.href;
            var directory = location.substring(0, location.lastIndexOf('/'));
            var hash = '#' + directory + '/js/libs/pako.min.js';
            var workerBlob = URL.createObjectURL(new Blob(["(" + workerScript.toString() + ")();"], {
                type: "text/javascript"
            })) + hash;
            this.worker = new Worker(workerBlob);
            this.worker.onmessage = handleMsg;
        }

        compress(str) {
            const payload = {
                data: str,
                requestType: 'compress'
            };
            return sendMsg(payload, this.worker);
        }

        decompress(str) {
            const payload = {
                data: str,
                requestType: 'decompress'
            };
            return sendMsg(payload, this.worker);
        }

        terminate() {
            this.worker.terminate();
        }
    };

    window.pakoWorker = pakoWorker;
})();


/**
 * DataManager
 * =====================================================
 */

// Rewrite core method to be async
DataManager.saveGame = async function (savefileId) {
    try {
        SceneManager.addSaveMessage('Saving');
        await StorageManager.backup(savefileId);
        return await this.saveGameWithoutRescue(savefileId);
    } catch (e) {
        console.error(e);
        try {
            StorageManager.remove(savefileId);
            StorageManager.restoreBackup(savefileId);
        } catch (e2) {
            console.error(e2);
        }
        return false;
    }
};

// Rewrite core method to be async
DataManager.saveGameWithoutRescue = async function (savefileId) {
    var json = JsonEx.stringify(this.makeSaveContents());
    if (json.length >= 200000) {
        console.warn('Save data too big!');
    }
    await StorageManager.save(savefileId, json);
    this._lastAccessedId = savefileId;
    var globalInfo = this.loadGlobalInfo() || [];
    globalInfo[savefileId] = this.makeSavefileInfo();
    await this.saveGlobalInfo(globalInfo);
    return true;
};


/**
 * StorageManager
 * =====================================================
 */

// New helper
StorageManager.compressDataWithWorker = async function (data) {
    if (data == null) return "";
    let worker = new pakoWorker();
    const compressedAndEncoded = await worker.compress(data);
    worker.terminate();
    worker = null;
    return compressedAndEncoded;
};

// New helper
StorageManager.decompressData = function (data) {
    if (data == null) return "";
    if (data == "") return null;
    const decoded = atob(data);
    return pako.inflate(decoded, {
        to: "string"
    });
};


/**
 * Overrides
 */

// Rewrite core method to split into separate functions
StorageManager.backup = async function (savefileId) {
    if (this.exists(savefileId)) {
        if (this.isLocalMode()) {
            return await this.backupLocal(savefileId);
        } else {
            return await this.backupWeb(savefileId);
        }
    } else {
        return false;
    }
};

// Rewrite core method to split into separate functions
StorageManager.cleanBackup = function (savefileId) {
    if (this.backupExists(savefileId)) {
        if (this.isLocalMode()) {
            this.cleanBackupLocal(savefileId);
        } else {
            this.cleanBackupWeb(savefileId);
        }
    }
};

// Rewrite core method to split into separate functions
StorageManager.restoreBackup = function (savefileId) {
    if (this.backupExists(savefileId)) {
        if (this.isLocalMode()) {
            this.restoreBackupLocal(savefileId);
        } else {
            this.restoreBackupWeb(savefileId);
        }
    }
};


/**
 * Local Pathway
 */

// New helper
StorageManager.makeLocalDirectory = function (dirPath) {
    const fs = require('fs');
    if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath);
    }
};

// New async method
StorageManager.backupLocal = async function (savefileId) {
    const fs = require('fs');
    var data = null;
    var filePath = this.localFilePath(savefileId);
    var filePathBackup = filePath + ".bak";
    var dirPath = this.localFileDirectoryPath();
    if (fs.existsSync(filePath)) {
        data = await fs.promises.readFile(filePath, {
            encoding: 'utf8'
        });
    }
    this.makeLocalDirectory(dirPath);
    await fs.promises.writeFile(filePathBackup, data);
    return true;
};

// New async method
StorageManager.cleanBackupLocal = function (savefileId) {
    const fs = require('fs');
    var dirPath = this.localFileDirectoryPath();
    var filePath = this.localFilePath(savefileId);
    fs.promises.unlink(filePath + ".bak");
};

// New async method
StorageManager.restoreBackupLocal = async function (savefileId) {
    const fs = require('fs');
    var data = this.loadFromLocalBackupFile(savefileId);
    var compressed = await this.compressDataWithWorker(data);
    var dirPath = this.localFileDirectoryPath();
    var filePath = this.localFilePath(savefileId);
    this.makeLocalDirectory(dirPath);
    await fs.promises.writeFile(filePath, compressed);
    fs.promises.unlink(filePath + ".bak");
};

// Rewrite core method to be async
StorageManager.saveToLocalFile = async function (savefileId, json) {
    const fs = require('fs');
    var data = await this.compressDataWithWorker(json);
    var dirPath = this.localFileDirectoryPath();
    var filePath = this.localFilePath(savefileId);
    this.makeLocalDirectory(dirPath);
    fs.promises.writeFile(filePath, data);
};

// Rewrite core method to use Pako
StorageManager.loadFromLocalFile = function (savefileId) {
    const fs = require('fs');
    var data = null;
    var filePath = this.localFilePath(savefileId);
    if (fs.existsSync(filePath)) {
        data = fs.readFileSync(filePath, {
            encoding: 'utf8'
        });
    }
    return this.decompressData(data);
};

// Rewrite core method to use Pako
StorageManager.loadFromLocalBackupFile = function (savefileId) {
    const fs = require('fs');
    var data = null;
    var filePath = this.localFilePath(savefileId) + ".bak";
    if (fs.existsSync(filePath)) {
        data = fs.readFileSync(filePath, {
            encoding: 'utf8'
        });
    }
    return this.decompressData(data);
};


/**
 * Web Pathway
 */

// New helper
StorageManager.getFromLocalStorage = function (initialKey) {
    const key = 'Save/' + initialKey;
    const data = localStorage.getItem(key);
    if (data == null) return "";
    if (data == "") return null;
    return data.substring(1, data.length - 1);
};

// New async method
StorageManager.backupWeb = async function (savefileId) {
    var key = this.webStorageKey(savefileId);
    var backupKey = key + "bak";
    var data = this.getFromLocalStorage(key);
    await localforage.setItem(backupKey, data);
    return true;
};

// New method to use localforage
StorageManager.cleanBackupWeb = function (savefileId) {
    var key = this.webStorageKey(savefileId);
    localforage.removeItem(key + "bak");
};

// New async method
StorageManager.restoreBackupWeb = async function (savefileId) {
    var data = this.loadFromWebStorageBackup(savefileId);
    var compressed = await this.compressDataWithWorker(data);
    var key = this.webStorageKey(savefileId);
    await localforage.setItem(key, compressed);
    localforage.removeItem(key + "bak");
};

// Rewrite core method to be async
StorageManager.saveToWebStorage = async function (savefileId, json) {
    var key = this.webStorageKey(savefileId);
    var data = await this.compressDataWithWorker(json);
    localforage.setItem(key, data);
};

// Rewrite core method to use Pako
StorageManager.loadFromWebStorage = function (savefileId, async) {
    var key = this.webStorageKey(savefileId);
    var data = this.getFromLocalStorage(key);
    return this.decompressData(data);
};

// Rewrite core method to use Pako
StorageManager.loadFromWebStorageBackup = function (savefileId) {
    var key = this.webStorageKey(savefileId) + "bak";
    var data = this.getFromLocalStorage(key);
    return this.decompressData(data);
};

// Rewrite core method because of key name change
StorageManager.webStorageBackupExists = function (savefileId) {
    var key = this.webStorageKey(savefileId) + "bak";
    return !!this.getFromLocalStorage(key);
};

// Rewrite core method because of key name change
StorageManager.webStorageExists = function (savefileId) {
    var key = this.webStorageKey(savefileId);
    return !!this.getFromLocalStorage(key);
};

// Rewrite core method because of key name change
StorageManager.removeWebStorage = function (savefileId) {
    var key = 'Save/' + this.webStorageKey(savefileId);
    localStorage.removeItem(key);
};


/**
 * Window_SaveMessage
 * =====================================================
 */

function Window_SaveMessage() {
    this.initialize.apply(this, arguments);
}

Window_SaveMessage.prototype = Object.create(Window_Base.prototype);
Window_SaveMessage.prototype.constructor = Window_SaveMessage;

Window_SaveMessage.prototype.initialize = function () {
    var width = 200;
    var height = this.lineHeight() * 2;
    var x = Graphics.boxWidth - width;
    var y = Graphics.boxHeight - height;
    Window_Base.prototype.initialize.call(this, x, y, width, height);
    this._duration = 0;
    this._openness = 0;
};

Window_SaveMessage.prototype.update = function () {
    Window_Base.prototype.update.call(this);
    if (this._duration > 0) {
        this._duration--;
    } else if (this._duration === 0) {
        this.contents.clear();
        this.close();
    }
};

Window_SaveMessage.prototype.addMessage = function (message) {
    this._duration = 60;
    this.contents.drawText(message, 0, 0, 200 - (this.standardPadding() * 2), 30, 'center');
    this.open();
};


/**
 * SceneManager
 * =====================================================
 */

SceneManager.createSaveMessageWindow = function () {
    if (!this._scene) return;
    this._scene._saveMessageWindow = new Window_SaveMessage();
    this._scene.addChild(this._scene._saveMessageWindow);
};

SceneManager.addSaveMessage = function (message) {
    if (this._scene && !this._scene._saveMessageWindow) {
        this.createSaveMessageWindow();
    }
    this._scene._saveMessageWindow.addMessage(message);
};


/**
 * Scene_Base
 * =====================================================
 */

var Scene_Base_prototype_terminate = Scene_Base.prototype.terminate;
Scene_Base.prototype.terminate = function () {
    Scene_Base_prototype_terminate.call(this);
    if (this._saveMessageWindow) {
        this.removeChild(this._saveMessageWindow);
        this._saveMessageWindow = null;
    }
};
