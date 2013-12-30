/*
 * compress
 * 
 *
 * Copyright (c) 2013 Romans
 * Licensed under the MIT license.
 */

'use strict';

var Q = require('q'),
    path = require('path'),
    _ = require('lodash'),
    util = require('util'),
    UglifyJS = require('uglify-js'),
    ycssmin = require('ycssmin'),
    stylus = require('stylus'),
    nib = require('nib');

module.exports = function (grunt) {


    function handleFilesGroups(options, group) {

        var data = {
            options: options,
            group: group
        };

        return Q(data).then(filterFiles)
            .then(readFiles)
            .then(joinFiles)
            .then(compressFiles)
            .then(prepareData)
            .then(writeFiles)
            .fail(function (e) {
                throw e
            })
    }

    function filterFiles(data) {

        data.jsFiles = [];
        data.cssFiles = [];

        data.group.src.forEach(function (filePath) {

            if (!grunt.file.exists(filePath)) {

               throw new Error('Source file "' + filePath + '" not found.')
            }

            var arrayType;

            switch (path.extname(filePath)) {
                case '.styl':
                case '.css':
                    arrayType = data.cssFiles;
                    break;
                case '.js':
                default:
                    arrayType = data.jsFiles;
                    break;
            }

            !_.contains(arrayType, filePath) && arrayType.push({filePath: filePath});
        });

        return data

    }

    function readFiles(data) {

        data.jsFiles.forEach(function (fileData) {

            fileData.content = grunt.file.read(fileData.filePath)
        });

        data.cssFiles.forEach(function (fileData) {
            fileData.content = handleCssFile(fileData.filePath)
        });

        return data
    }

    function handleCssFile(filePath) {
        var file = grunt.file.read(filePath);

        if (path.extname(filePath) == '.styl') {

            try {
                file = stylus(file.replace(/\r/g, '')).set("compress")
                    .define('url', stylus.url())
                    .use(nib())
                    .render();
            } catch (e) {
                file = "";
                grunt.log.error('failed to convert styl file:' + filePath, e);
            }
        }

        return file;
    }

    function joinFiles(data) {
        data.joinedJs = _.flatten(data.jsFiles, 'content').join(grunt.util.normalizelf(data.options.separator));
        data.joinedCss = _.flatten(data.cssFiles, 'content').join('');

        return data;
    }

    function compressFiles(data) {

        if (data.joinedJs) {
            data.compressedJsData = compressJsFiles(data.jsFiles, data.group);
        }

        if (data.joinedCss) {
            data.compressedCssData = compressCssFiles(data.joinedCss);
        }
        return data;
    }

    function compressJsFiles(filesData, group) {

        var compressedData = "",
            fileMap = path.basename(group.dest) + '.min.js',
            files = _.flatten(filesData, 'filePath');

        try {
            compressedData = UglifyJS.minify(files, {outSourceMap: fileMap, sourceMapRoot: '/'})
        } catch (e) {
            grunt.log.error('failed to compress js', e);
            throw new Error('failed to compress js');
        }

        return compressedData;
    }


    function compressCssFiles(joinedCss) {

        var compressed = "";

        try {
            compressed = ycssmin.cssmin(joinedCss);

        } catch (e) {
            grunt.log.error('failed to compress css ', e);
            throw new Error('failed to compress css');
        }

        return compressed;
    }

    function cssIncluseImages(css, cssImagesStaticUrl) {
        var imgRegex = /url\s?\(['"]?(.*?)(?=['"]?\))/gi,
            match;

        try {
            while (match = imgRegex.exec(css)) {

                var imagePath = match[1];

                if (imagePath.indexOf("http://") == -1 && imagePath.indexOf(";base64") == -1) {

                    var fileName = imagePath.substring(path.dirname(url.parse(imagePath).pathname).length + 1);

                    css = css.replace(match[1], cssImagesStaticUrl + fileName);

                }
            }
        } catch (e) {

        }


        return css;
    }

    function prepareData(data) {

        if (data.options.cssInJsTemplate && data.compressedCssData) {

            var css = data.compressedCssData.replace(/\'/g, '\\\'')
                .replace(/\"/g, '\\"')
                .replace(/(\r\n|\n|\r)/gm, "");

            css = util.format(data.options.cssInJsTemplate, css)


            data.compressedJsData.code += css;
            data.joinedJs += css;
        }

        if (data.compressedJsData) {
            data.compressedJsData.code += "\n//@ sourceMappingURL=" + path.basename(data.group.dest) + ".min.js.map"

            data.compressedJsData.map = data.compressedJsData.map.replace(/"public\//g,'"/')
        }


        return data;
    }


    function writeFiles(data) {

        if (data.joinedJs) {
            grunt.file.write(data.group.dest + '.min.js', data.compressedJsData.code);
            grunt.log.success('file created: ' + data.group.dest + '.min.js');

            grunt.file.write(data.group.dest + '.min.js.map', data.compressedJsData.map);
            grunt.log.success('file created: ' + data.group.dest + '.min.map');

            grunt.file.write(data.group.dest + '.js', data.joinedJs);
            grunt.log.success('file created: ' + data.group.dest + '.js');
        }

        if (data.joinedCss && !data.options.cssInJsTemplate) {
            grunt.file.write(data.group.dest + '.min.css', data.compressedCssData);
            grunt.log.success('file created: ' + data.group.dest + '.min.css');

            grunt.file.write(data.group.dest + '.css', data.joinedCss);
            grunt.log.success('file created: ' + data.group.dest + '.css');
        }



        return data

    }

//    function uploadToS3(data) {
//
//        if(data.options.uploadToS3){
//            s3.uploadToS3(path.basename(data.group.dest + '.min.js'),data.compressedJsData.code,data.options.s3)
//        }
//    }


    function onSuccess() {
        grunt.log.success('Task Finished');
    }

    function onError(err) {
        //err.stack
        grunt.log.error(err);
    }

    grunt.registerMultiTask('compress', 'compress and minify', function () {

        var options = this.options({
            separator: ';'
        });

        var done = this.async(),
            promises = this.files.map(handleFilesGroups.bind(this, options));

        Q.all(promises).then(onSuccess).fail(onError).done(done);

    });

}
;
