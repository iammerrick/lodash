#!/usr/bin/env node
;(function() {
  'use strict';

  /** The Node filesystem and path modules */
  var fs = require('fs'),
      path = require('path');

  /** Load other modules */
  var lodash = require(path.join(__dirname, 'lodash')),
      minify = require(path.join(__dirname, 'build', 'minify'));

  /** Flag used to specify a mobile build */
  var isMobile = process.argv.indexOf('mobile') > -1;

  /** Shortcut used to convert array-like objects to arrays */
  var slice = [].slice;

  /** The lodash.js source */
  var source = fs.readFileSync(path.join(__dirname, 'lodash.js'), 'utf8');

  /** Used to associate aliases with their real names */
  var aliasToRealMap = {
    'all': 'every',
    'any': 'some',
    'collect': 'map',
    'detect': 'find',
    'each': 'forEach',
    'foldl': 'reduce',
    'foldr': 'reduceRight',
    'head': 'first',
    'include': 'contains',
    'inject': 'reduce',
    'methods': 'functions',
    'select': 'filter',
    'tail': 'rest',
    'take': 'first',
    'unique': 'uniq'
  };

  /** Used to associate real names with their aliases */
  var realToAliasMap = {
    'contains': ['include'],
    'every': ['all'],
    'filter': ['select'],
    'find': ['detect'],
    'first': ['head', 'take'],
    'forEach': ['each'],
    'functions': ['methods'],
    'map': ['collect'],
    'reduce': ['foldl', 'inject'],
    'reduceRight': ['foldr'],
    'rest': ['tail'],
    'some': ['any'],
    'uniq': ['unique']
  };

  /** Used to track function dependencies */
  var dependencyMap = {
    'after': [],
    'bind': [],
    'bindAll': ['bind'],
    'chain': ['mixin'],
    'clone': ['extend', 'isArray'],
    'compact': [],
    'compose': [],
    'contains': ['createIterator'],
    'createIterator': [],
    'debounce': [],
    'defaults': ['createIterator'],
    'defer': [],
    'delay': [],
    'difference': ['indexOf'],
    'escape': [],
    'every': ['createIterator', 'identity'],
    'extend': ['createIterator'],
    'filter': ['createIterator', 'identity'],
    'find': ['createIterator'],
    'first': [],
    'flatten': ['isArray'],
    'forEach': ['createIterator'],
    'forIn': ['createIterator'],
    'forOwn': ['createIterator'],
    'functions': ['createIterator'],
    'groupBy': ['createIterator'],
    'has': [],
    'identity': [],
    'indexOf': ['sortedIndex'],
    'initial': [],
    'intersection': ['every', 'indexOf'],
    'invoke': [],
    'isArguments': [],
    'isArray': [],
    'isBoolean': [],
    'isDate': [],
    'isElement': [],
    'isEmpty': ['createIterator'],
    'isEqual': [],
    'isFinite': [],
    'isFunction': [],
    'isNaN': [],
    'isNull': [],
    'isNumber': [],
    'isObject': [],
    'isRegExp': [],
    'isString': [],
    'isUndefined': [],
    'keys': ['createIterator'],
    'last': [],
    'lastIndexOf': [],
    'map': ['createIterator', 'identity'],
    'max': [],
    'memoize': [],
    'min': [],
    'mixin': ['forEach'],
    'noConflict': [],
    'once': [],
    'partial': [],
    'pick': [],
    'pluck': [],
    'range': [],
    'reduce': ['createIterator'],
    'reduceRight': ['keys'],
    'reject': ['createIterator', 'identity'],
    'rest': [],
    'result': [],
    'shuffle': [],
    'size': ['keys'],
    'some': ['createIterator', 'identity'],
    'sortBy': ['map', 'pluck'],
    'sortedIndex': ['identity'],
    'tap': [],
    'template': ['escape'],
    'throttle': [],
    'times': [],
    'toArray': ['values'],
    'union': ['indexOf'],
    'uniq': ['identity', 'indexOf'],
    'uniqueId': [],
    'values': ['createIterator'],
    'without': ['indexOf'],
    'wrap': [],
    'zip': ['max', 'pluck']
  };

  /** Names of all methods */
  var allMethods = Object.keys(dependencyMap);

  /** Names of methods to filter for the build */
  var filterMethods = allMethods;

  /** Used to specify whether `filterMethods` is used for exclusion or inclusion */
  var filterType = process.argv.reduce(function(result, value) {
    if (result) {
      return result;
    }
    var pair = value.match(/^(category|exclude|include)=(.*)$/);
    if (!pair) {
      return result;
    }

    result = pair[1];
    filterMethods = pair[2].split(/, */).map(getRealName);

    if (result == 'category') {
      // resolve method names belonging to each category
      filterMethods = filterMethods.reduce(function(result, category) {
        return result.concat(allMethods.filter(function(funcName) {
          return RegExp('@category ' + category + '\\b', 'i').test(matchFunction(source, funcName));
        }));
      }, []);
    }
    else {
      // remove nonexistent method names
      filterMethods = lodash.intersection(allMethods, filterMethods);
    }
    return result;
  }, '');

  /*--------------------------------------------------------------------------*/

  /**
   * Gets the aliases associated with a given `funcName`.
   *
   * @private
   * @param {String} funcName The name of the function to get aliases for.
   * @returns {Array} Returns an array of aliases.
   */
  function getAliases(funcName) {
    return realToAliasMap[funcName] || [];
  }

  /**
   * Gets an array of depenants for a function by the given `funcName`.
   *
   * @private
   * @param {String} funcName The name of the function to query.
   * @returns {Array} Returns an array of function dependants.
   */
  function getDependants(funcName) {
    // iterate over `dependencyMap`, adding the names of functions that
    // have `funcName` as a dependency
    return lodash.reduce(dependencyMap, function(result, dependencies, otherName) {
      if (dependencies.indexOf(funcName) > -1) {
        result.push(otherName);
      }
      return result;
    }, []);
  }

  /**
   * Gets an array of dependencies for a function of the given `funcName`.
   *
   * @private
   * @param {String} funcName The name of the function to query.
   * @returns {Array} Returns an array of function dependencies.
   */
  function getDependencies(funcName) {
    var dependencies = dependencyMap[funcName],
        result = [];

    if (!dependencies) {
      return result;
    }
    // recursively accumulate the dependencies of the `funcName` function, and
    // the dependencies of its dependencies, and so on.
    return dependencies.reduce(function(result, otherName) {
      result.push.apply(result, getDependencies(otherName).concat(otherName));
      return result;
    }, result);
  }

  /**
   * Gets the real name, not alias, of a given `funcName`.
   *
   * @private
   * @param {String} funcName The name of the function to resolve.
   * @returns {String} Returns the real name.
   */
  function getRealName(funcName) {
    return aliasToRealMap[funcName] || funcName;
  }

  /**
   * Determines if all functions of the given names have been removed from `source`.
   *
   * @private
   * @param {String} source The source to inspect.
   * @param {String} [funcName1, funcName2, ...] The names of functions to check.
   * @returns {Boolean} Returns `true` if all functions have been removed, else `false`.
   */
  function isRemoved(source) {
    return slice.call(arguments, 1).every(function(funcName) {
      return !matchFunction(source, funcName);
    });
  }

  /**
   * Searches `source` for a `funcName` function declaration, expression, or
   * assignment and returns the matched snippet.
   *
   * @private
   * @param {String} source The source to inspect.
   * @param {String} funcName The name of the function to match.
   * @returns {String} Returns the matched function snippet.
   */
  function matchFunction(source, funcName) {
    var result = source.match(RegExp(
      // match multi-line comment block (could be on a single line)
      '\\n +/\\*[^*]*\\*+(?:[^/][^*]*\\*+)*/\\n' +
      // begin non-capturing group
      '(?:' +
      // match a function declaration
      '( +)function ' + funcName + '\\b[\\s\\S]+?\\n\\1}|' +
      // match a variable declaration with `createIterator`
      ' +var ' + funcName + ' *=.*?createIterator\\((?:{|[a-zA-Z])[\\s\\S]+?\\);|' +
      // match a variable declaration with function expression
      '( +)var ' + funcName + ' *=.*?function[\\s\\S]+?\\n\\2};' +
      // end non-capturing group
      ')\\n'
    ));

    return result ? result[0] : '';
  }

  /**
   * Removes the all references to `refName` from the `createIterator` source.
   *
   * @private
   * @param {String} source The source to process.
   * @param {String} refName The name of the reference to remove.
   * @returns {String} Returns the modified source.
   */
  function removeFromCreateIterator(source, refName) {
    var snippet = matchFunction(source, 'createIterator'),
        modified = snippet.replace(RegExp('\\b' + refName + '\\b,? *', 'g'), '');

    return source.replace(snippet, modified);
  }

  /**
   * Removes the `funcName` function declaration, expression, or assignment and
   * associated code from `source`.
   *
   * @private
   * @param {String} source The source to process.
   * @param {String} funcName The name of the function to remove.
   * @returns {String} Returns the source with the function removed.
   */
  function removeFunction(source, funcName) {
    var modified,
        snippet = matchFunction(source, funcName);

    // exit early if function is not found
    if (!snippet) {
      return source;
    }
    // remove function
    source = source.replace(matchFunction(source, funcName), '');

    // grab the method assignments snippet
    snippet = source.match(/lodash\.VERSION *= *[\s\S]+?\/\*-+\*\/\n/)[0];

    // remove assignment and aliases
    modified = getAliases(funcName).concat(funcName).reduce(function(result, otherName) {
      return result.replace(RegExp('(?:\\n *//.*\\s*)* *lodash\\.' + otherName + ' *= *.+\\n'), '');
    }, snippet);

    // replace with the modified snippet
    source = source.replace(snippet, modified);

    return removeFromCreateIterator(source, funcName);
  }

  /**
   * Removes the `_.isArguments` fallback from `source`.
   *
   * @private
   * @param {String} source The source to process.
   * @returns {String} Returns the source with the `isArguments` fallback removed.
   */
  function removeIsArgumentsFallback(source) {
    return source.replace(/(?: *\/\/.*)*\s*if *\(!isArguments[^)]+\)[\s\S]+?};?\s*}\n/, '');
  }

  /**
   * Removes a given variable from `source`.
   *
   * @private
   * @param {String} source The source to process.
   * @param {String} varName The name of the variable to remove.
   * @returns {String} Returns the source with the variable removed.
   */
  function removeVar(source, varName) {
    source = source.replace(RegExp(
      // begin non-capturing group
      '(?:' +
      // match multi-line comment block
      '(?:\\n +/\\*[^*]*\\*+(?:[^/][^*]*\\*+)*/)?\\n' +
      // match a variable declaration that's not part of a declaration list
      '( +)var ' + varName + ' *= *(?:.*?;|(?:Function\\(.+?|.*?[^,])\\n[\\s\\S]+?\\n\\1.+?;)\\n|' +
      // match a variable in a declaration list
      '\\n +' + varName + ' *=.*?,' +
      // end non-capturing group
      ')'
    ), '');

    // remove a varaible at the start of a variable declaration list
    source = source.replace(RegExp('(var +)' + varName + ' *=.+?,\\s+'), '$1');

    // remove a variable at the end of a variable declaration list
    source = source.replace(RegExp(',\\s*' + varName + ' *=.*?;'), ';');

    return removeFromCreateIterator(source, varName);
  }

  /**
   * Removes non-syntax critical whitespace from a string.
   *
   * @private
   * @param {String} source The source to process.
   * @returns {String} Returns the source with whitespace removed.
   */
  function removeWhitespace(source) {
    return source.replace(/\[object |else if|function | in |return\s+[\w']|throw |typeof |var |@ |\\\\n|\\n|\s+/g, function(match) {
      return match == false || match == '\\n' ? '' : match;
    });
  }

  /*--------------------------------------------------------------------------*/

  // custom build
  (function() {
    // exit early if "category", "exclude", or "include" options aren't specified
    if (!filterType) {
      return;
    }
    if (filterType == 'exclude') {
      // remove methods that are named in `filterMethods` and their dependants
      filterMethods.forEach(function(funcName) {
        getDependants(funcName).concat(funcName).forEach(function(otherName) {
          source = removeFunction(source, otherName);
        });
      });
    }
    else {
      // add dependencies to `filterMethods`
      filterMethods = lodash.uniq(filterMethods.reduce(function(result, funcName) {
        result.push.apply(result, getDependencies(funcName).concat(funcName));
        return result;
      }, []));

      // remove methods that aren't named in `filterMethods`
      lodash.each(dependencyMap, function(dependencies, otherName) {
        if (filterMethods.indexOf(otherName) < 0) {
          source = removeFunction(source, otherName);
        }
      });
    }

    // remove associated functions, variables and code snippets
    if (isRemoved(source, 'isArguments')) {
      source = removeIsArgumentsFallback(source);
    }
    if (isRemoved(source, 'mixin')) {
      // remove `LoDash` constructor
      source = removeFunction(source, 'LoDash');
      // remove `LoDash` calls
      source = source.replace(/(?:new +LoDash(?!\()|(?:new +)?LoDash\([^)]*\));?/g, '');
      // remove `LoDash.prototype` additions
      source = source.replace(/(?:\s*\/\/.*)*\s*LoDash.prototype *=[\s\S]+?\/\*-+\*\//, '');
    }
    if (isRemoved(source, 'template')) {
      // remove `templateSettings` assignment
      source = source.replace(/(?:\n +\/\*[^*]*\*+(?:[^\/][^*]*\*+)*\/)?\n *lodash\.templateSettings[\s\S]+?};\n/, '');
    }
    if (isRemoved(source, 'isArray', 'isEmpty', 'isEqual', 'size')) {
      source = removeVar(source, 'arrayClass');
    }
    if (isRemoved(source, 'bind', 'functions', 'groupBy', 'invoke', 'isEqual', 'isFunction', 'result', 'sortBy', 'toArray')) {
      source = removeVar(source, 'funcClass');
    }
    if (isRemoved(source, 'bind')) {
      source = removeVar(source, 'nativeBind');
    }
    if (isRemoved(source, 'isArray')) {
      source = removeVar(source, 'nativeIsArray');
    }
    if (isRemoved(source, 'keys')) {
      source = removeVar(source, 'nativeKeys');
    }
    if (isRemoved(source, 'clone', 'isObject', 'keys')) {
      source = removeVar(source, 'objectTypes');
      source = removeFromCreateIterator(source, 'objectTypes');
    }
    if (isRemoved(source, 'bind', 'isArray', 'keys')) {
      source = removeVar(source, 'reNative');
    }
    if (isRemoved(source, 'isEmpty', 'isEqual', 'isString', 'size')) {
      source = removeVar(source, 'stringClass');
    }

    // consolidate consecutive horizontal rule comment separators
    source = source.replace(/(?:\s*\/\*-+\*\/\s*){2,}/g, function(separators) {
      return separators.match(/^\s*/)[0] + separators.slice(separators.lastIndexOf('/*'));
    });
  }());

  /*--------------------------------------------------------------------------*/

  if (isMobile) {
    // inline functions defined with `createIterator`
    lodash.functions(lodash).forEach(function(funcName) {
      // match `funcName` with pseudo private `_` prefixes removed to allow matching `shimKeys`
      var reFunc = RegExp('(\\bvar ' + funcName.replace(/^_/, '') + ' *= *)createIterator\\(((?:{|[a-zA-Z])[\\s\\S]+?)\\);\\n');

      // skip if not defined with `createIterator`
      if (!reFunc.test(source)) {
        return;
      }
      // extract and format the function's code
      var code = (lodash[funcName] + '').replace(/\n(?:.*)/g, function(match) {
        match = match.slice(1);
        return (match == '}' ? '\n  ' : '\n    ') + match;
      });

      source = source.replace(reFunc, '$1' + code + ';\n');
    });

    source = removeIsArgumentsFallback(source);

    source = removeVar(source, 'iteratorTemplate');

    // remove JScript [[DontEnum]] fix from `isEqual`
    source = source.replace(/(?:\s*\/\/.*\n)*( +)if *\(result *&& *hasDontEnumBug[\s\S]+?\n\1}\n/, '\n');

    // remove IE `shift` and `splice` fix
    source = source.replace(/(?:\s*\/\/.*\n)*( +)if *\(value.length *=== *0[\s\S]+?\n\1}\n/, '\n');
  }
  else {
    // inline `iteratorTemplate` template
    source = source.replace(/(( +)var iteratorTemplate *= *)([\s\S]+?\n\2.+?);\n/, (function() {
      // extract `iteratorTemplate` code
      var code = /^function[^{]+{([\s\S]+?)}$/.exec(lodash._iteratorTemplate)[1];

      code = removeWhitespace(code)
        // remove unnecessary code
        .replace(/\|\|\{\}|,__t,__j=Array.prototype.join|function print[^}]+}|\+''/g, '')
        .replace(/(\{);|;(\})/g, '$1$2')
        .replace(/\(\(__t=\(([^)]+)\)\)==null\?'':__t\)/g, '$1')
        // ensure escaped characters are interpreted correctly in the string literal
        .replace(/\\/g, '\\\\');

      // add `code` to `Function()` as a string literal to avoid strict mode
      // errors caused by the required with-statement
      return '$1Function(\'obj\',\n$2  "' + code + '"\n$2);\n';
    }()));
  }

  // remove pseudo private properties
  source = source.replace(/(?:(?:\s*\/\/.*)*\s*lodash\._[^=]+=.+\n)+/g, '\n');

  /*--------------------------------------------------------------------------*/

  // begin the minification process
  if (filterType || isMobile) {
    fs.writeFileSync(path.join(process.cwd(), 'lodash.custom.js'), source);
    minify(source, 'lodash.custom.min', function(result) {
      fs.writeFileSync(path.join(process.cwd(), 'lodash.custom.min.js'), result);
    });
  }
  else {
    minify(source, 'lodash.min', function(result) {
      fs.writeFileSync(path.join(process.cwd(), 'lodash.min.js'), result);
    });
  }
}());
