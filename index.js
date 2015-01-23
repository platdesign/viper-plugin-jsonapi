'use strict';

var express = require('express');
var fs = require('fs');
var path = require('path');
var extend = require('extend');



var paramsReqAttr = 'jsonApiParams';
var nonCustomHandlerNames = ['param', 'get', 'post', 'put', 'delete', 'getIndex'];

var defaultConfig = {
	path: './api',
	baseRoute: '/api'
};


module.exports = function backend() {

	var that = this;

	if( this._config.jsonApi ) {
		var config = this._config.jsonApi;

		// Walk config and create api-routes for each item
		Object.keys(config).forEach(function(item) {

			that.run(function(router, extend, inject) {

				var args = extend(true, {}, defaultConfig, config[item]);

				var apiPath = path.resolve( that.cwd(), args.path);

				inject( dir2router(apiPath, null, true) ).then(function(apiRouter) {
					router.use(args.baseRoute, apiRouter);
				}, function(err) {
					console.log(err.stack)
					console.log(err.message.red);
				});

			});

		});

	}


};









function dir2router(dir, parentHandler, isBaseDir) {

	return function(inject) {
		var router = express.Router();


		router.use(function(req, res, next) {
			req[paramsReqAttr] = req[paramsReqAttr] || {};
			next();
		});


		function createApiRouteHandler (handler) {
			return function(req, res, next) {

				var parent = {};

				if(parentHandler) {
					Object.keys(parentHandler).forEach(function(key) {
						parent[key] = function() {
							return parentHandler[key](req, res, next);
						};
					});
				}

				return inject(handler, {
					req:req,
					res:res,
					params: req.jsonApiParams,
					parent: parent
				}).then(function(result) {
					res.json(result);
				}, function(err) {
					res.json({
						error: {
							message: err.message
						}
					});
				});

			};
		}


		var subFolders = [];

		var handlerObj = {};

		var subRoutesParentObj = {};

		fs.readdirSync(dir).forEach(function(item) {
			if(item.substr(0, 1) !== '.') {
				var itemPath = path.join(dir, item);
				var stat = fs.statSync(itemPath);

				if(stat.isDirectory()) {
					subFolders.push(itemPath);
				} else if( stat.isFile() ) {
					extend(true, handlerObj, require(itemPath));
				}
			}
		});


		if( !handlerObj.param ) {
			handlerObj.param = path.basename(dir)+'Id';
		}

		var baseRoute = '/';
		var itemRoute = '/:' + handlerObj.param;

		// Register param
		router.param(handlerObj.param, function(req, res, next, value) {
			req[paramsReqAttr][handlerObj.param] = value;
			next();
		});


		// Helper to create handler and it to subRoutesParentObj
		function createHandler (method, name, route) {
			if( handlerObj[name] ) {

				var obj = handlerObj[name];
					obj.config = obj.config || {};
					obj.config.route = obj.config.route || route;

				var handler = createApiRouteHandler( obj );

				subRoutesParentObj[name] = handler;
				router[method](obj.config.route, handler);
				return handler;
			}
		}



		/**
		 * Register Routes
		 */

		// Custom
		Object.keys(handlerObj).filter(function(key) {
			return (nonCustomHandlerNames.indexOf(key) === -1);
		}).forEach(function(key) {
			var obj = handlerObj[key];
				obj.config = obj.config || {};
			var route = obj.config.route || '/'+key;
			var method = obj.config.method || 'get';
			createHandler(method, key, route);
		});

		// GetIndex
		createHandler('get', 'getIndex', baseRoute);

		// Get :id
		createHandler('get', 'get', itemRoute);

		// Post
		createHandler('post', 'post', baseRoute);

		// Update :id
		createHandler('put', 'put', itemRoute);

		// Delete :id
		createHandler('delete', 'delete', itemRoute);






		// Create subRouters and use them in router
		subFolders.forEach(function(dir) {
			var resourceName = path.basename(dir);
			if(isBaseDir) {
				itemRoute = '';
			}
			router.use(itemRoute + '/' + resourceName, dir2router(dir, subRoutesParentObj)(inject));
		});

		return router;
	};

};

