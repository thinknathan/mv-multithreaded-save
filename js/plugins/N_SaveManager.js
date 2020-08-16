/*:
 * @plugindesc v1.02 Save files asynchronously and use deflate compression.
 * @author Think_Nathan
 */

// =========================================
// LocalForage Settings
// =========================================
localforage.config({
    name: 'Save',
    driver: localforage.LOCALSTORAGE
});

// =================================================================
// =================================================================
// DataManager
// =================================================================
// =================================================================

// =========================================
// New Helpers
// =========================================
DataManager.stringifyData = async function (data) {
    return JsonEx.stringify(data);
};

// =========================================
// Overrides
// =========================================
DataManager.saveGame = async function (savefileId) {
    try {
        await StorageManager.backup(savefileId);
        return await this.saveGameWithoutRescue(savefileId);
    } catch (e) {
        console.error(e);
        try {
            StorageManager.remove(savefileId);
            await StorageManager.restoreBackup(savefileId);
        } catch (e2) {
            console.error(e2);
        }
        return false;
    }
};

DataManager.saveGameWithoutRescue = async function (savefileId) {
    var json = await this.stringifyData(this.makeSaveContents());
    if (json.length >= 200000) {
        console.warn('Save data too big!');
    }
    await StorageManager.save(savefileId, json);
    this._lastAccessedId = savefileId;
    var globalInfo = this.loadGlobalInfo() || [];
    globalInfo[savefileId] = this.makeSavefileInfo();
    this.saveGlobalInfo(globalInfo);
    return true;
};

// =================================================================
// =================================================================
// StorageManager
// =================================================================
// =================================================================

// =========================================
// New Helpers
// =========================================
Utils.supportsWorkers = function () {
    return !!(typeof Worker);
};

StorageManager.compressData = async function (data) {
    if (data == null) return "";
    let compressed;
    if (Utils.supportsWorkers()) {
        compressed = await this.compressDataWithWorker(data);
    } else {
        compressed = await this.compressDataWithPako(data);
    }
    return await this.encodeData(compressed);
};

StorageManager.compressDataWithWorker = async function (data) {
    let wrapper = new pakoWrapper();
    const compressed = await wrapper.compress(data);
    wrapper.terminate();
    wrapper = null;
    return compressed;
};

StorageManager.compressDataWithPako = async function (data) {
    const compressed = pako.deflate(data, {
        to: "string",
        level: 1
    });
    return compressed;
};

StorageManager.decompressData = function (data) {
    if (data == null) return "";
    if (data == "") return null;
    const compressed = this.decodeData(data);

    return pako.inflate(compressed, {
        to: "string"
    });
};

StorageManager.encodeData = async function (data) {
    return btoa(data);
};

StorageManager.decodeData = function (data) {
    return atob(data);
};

StorageManager.fs = function () {
    return require('fs');
};

StorageManager.getFromLocalStorage = function (key) {
    var data = localStorage.getItem(key);
    if (data == null) return "";
    if (data == "") return null;
    return data.substring(1, data.length - 1);
};

StorageManager.makeLocalDirectory = async function (dirPath) {
    if (!this.fs().existsSync(dirPath)) {
        await this.fs().promises.mkdir(dirPath);
    }
};

// =========================================
// Overrides
// =========================================
StorageManager.save = function (savefileId, json) {
    if (this.isLocalMode()) {
        this.saveToLocalFile(savefileId, json);
    } else {
        this.saveToWebStorage(savefileId, json);
    }
};

StorageManager.load = function (savefileId) {
    if (this.isLocalMode()) {
        return this.loadFromLocalFile(savefileId);
    } else {
        return this.loadFromWebStorage(savefileId);
    }
};

StorageManager.backup = function (savefileId) {
    if (this.exists(savefileId)) {
        if (this.isLocalMode()) {
            this.backupLocal(savefileId);
        } else {
            this.backupWeb(savefileId);
        }
    }
};

StorageManager.cleanBackup = function (savefileId) {
    if (this.backupExists(savefileId)) {
        if (this.isLocalMode()) {
            this.cleanBackupLocal(savefileId);
        } else {
            this.cleanBackupWeb(savefileId);
        }
    }
};

StorageManager.restoreBackup = function (savefileId) {
    if (this.backupExists(savefileId)) {
        if (this.isLocalMode()) {
            this.restoreBackupLocal(savefileId);
        } else {
            this.restoreBackupWeb(savefileId);
        }
    }
};

// =========================================
// Local Overrides
// =========================================
StorageManager.backupLocal = async function (savefileId) {
    var data = await this.loadFromLocalFile(savefileId);
    var compressed = await StorageManager.compressData(data);

    var dirPath = this.localFileDirectoryPath();
    var filePath = this.localFilePath(savefileId) + ".bak";
    await this.makeLocalDirectory(dirPath);
    await this.fs().promises.writeFile(filePath, compressed);
};

StorageManager.cleanBackupLocal = async function (savefileId) {
    var dirPath = this.localFileDirectoryPath();
    var filePath = this.localFilePath(savefileId);
    await this.fs().promises.unlink(filePath + ".bak");
};

StorageManager.restoreBackupLocal = async function (savefileId) {
    var data = await this.loadFromLocalBackupFile(savefileId);
    var compressed = await StorageManager.compressData(data);
    var dirPath = this.localFileDirectoryPath();
    var filePath = this.localFilePath(savefileId);
    await this.makeLocalDirectory(dirPath);
    await this.fs().promises.writeFile(filePath, compressed);
    await this.fs().promises.unlink(filePath + ".bak");
};

StorageManager.saveToLocalFile = async function (savefileId, json) {
    var data = await StorageManager.compressData(json);
    var dirPath = this.localFileDirectoryPath();
    var filePath = this.localFilePath(savefileId);
    await this.makeLocalDirectory(dirPath);
    await this.fs().promises.writeFile(filePath, data);
};

StorageManager.loadFromLocalFile = function (savefileId) {
    var data = null;
    var filePath = this.localFilePath(savefileId);
    if (this.fs().existsSync(filePath)) {
        data = this.fs().readFileSync(filePath, {
            encoding: 'utf8'
        });
    }
    return StorageManager.decompressData(data);
};

StorageManager.loadFromLocalBackupFile = function (savefileId) {
    var data = null;
    var filePath = this.localFilePath(savefileId) + ".bak";
    if (this.fs().existsSync(filePath)) {
        data = this.fs().readFileSync(filePath, {
            encoding: 'utf8'
        });
    }
    return StorageManager.decompressData(data);
};

StorageManager.localFileBackupExists = function (savefileId) {
    return this.fs().existsSync(this.localFilePath(savefileId) + ".bak");
};

StorageManager.localFileExists = function (savefileId) {
    return this.fs().existsSync(this.localFilePath(savefileId));
};

StorageManager.removeLocalFile = function (savefileId) {
    var filePath = this.localFilePath(savefileId);
    if (this.fs().existsSync(filePath)) {
        this.fs().unlinkSync(filePath);
    }
};

// =========================================
// Web Overrides
// =========================================
StorageManager.backupWeb = async function (savefileId) {
    var data = this.loadFromWebStorage(savefileId);
    var compressed = await StorageManager.compressData(data);
    var key = this.webStorageKey(savefileId) + "bak";
    await localforage.setItem(key, compressed);
};

StorageManager.cleanBackupWeb = async function (savefileId) {
    var key = this.webStorageKey(savefileId);
    await localforage.removeItem(key + "bak");
};

StorageManager.restoreBackupWeb = async function (savefileId) {
    var data = this.loadFromWebStorageBackup(savefileId);
    var compressed = await StorageManager.compressData(data);
    var key = this.webStorageKey(savefileId);
    await localforage.setItem(key, compressed);
    await localforage.removeItem(key + "bak");
};

StorageManager.saveToWebStorage = async function (savefileId, json) {
    var key = this.webStorageKey(savefileId);
    var data = await StorageManager.compressData(json);
    await localforage.setItem(key, data);
};

StorageManager.loadFromWebStorage = function (savefileId) {
    var key = 'Save/' + this.webStorageKey(savefileId);
    var data = this.getFromLocalStorage(key);
    return StorageManager.decompressData(data);
};

StorageManager.loadFromWebStorageBackup = function (savefileId) {
    var key = 'Save/' + this.webStorageKey(savefileId) + "bak";
    var data = this.getFromLocalStorage(key);
    return StorageManager.decompressData(data);
};

StorageManager.webStorageBackupExists = function (savefileId) {
    var key = 'Save/' + this.webStorageKey(savefileId) + "bak";
    return !!this.getFromLocalStorage(key);
};

StorageManager.webStorageExists = function (savefileId) {
    var key = 'Save/' + this.webStorageKey(savefileId);
    return !!this.getFromLocalStorage(key);
};

StorageManager.removeWebStorage = function (savefileId) {
    var key = 'Save/' + this.webStorageKey(savefileId);
    localStorage.removeItem(key);
};
