/*:
 * @plugindesc v1.00 Adds data to bloat the save file.
 * @author Think_Nathan
 *
 * @help No plugin commands.
 */

(function () {

    var DataManager_makeSaveContents = DataManager.makeSaveContents;
    DataManager.makeSaveContents = function () {
        var contents = DataManager_makeSaveContents.call(this);

        if ($gameSwitches.value(1)) {
            var bloat = [];
            for (var i = 0; i < 10000; i++) {
                bloat.push(Math.random());
            }
            contents.bloat = bloat;
        }

        return contents;
    };

})();
