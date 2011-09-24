(function(){
    'use strict';
    /* To Do:
        1. refactor regexps into literals
    */
    var reCombinators = /^(\s*)([A-Za-z0-9\*]*)(\s*)(>\s*|~\s*|\+\s*|#[\w\u00c0-\uFFFF\-]+|\[[^\]]*\]{1}|:[\w\-]*\({1}[^\)]*\){1}|:[\w\-]*|\.[\w\u00c0-\uFFFF\-]*|){1}(.*)$/, 
        /*
            combinators:
            ^(\s*) - grab white space preceding tagName, means it descends from.
            ([A-Za-z0-9\*]*) - grab tag name
            (\s*) - grab white space proceding tagName, all the tagNames have descendent selectors.
            (
                >\s*| - grab children selector, move forward OR
                ~\s*| - grab general next sibling selector, move forward OR
                \+\s*| - grab immediate next sibling selector, move forward OR
                #[\w\\u00c0-\uFFFF\-]+| - grab id selector, move forward OR
                \[[^\]]*\]{1}| - grab attribute selector, move forward OR
                :[\w\-]*\({1}[^\)]*\){1}| - grab pseudo-selector WITH parentheses, move forward OR 
                :[\w\-]*| - grab pseudo-selector WITHOUT parentheses, move forward OR
                \.[\w\\u00c0-\uFFFF\-]*| - grab class-selector and relevant values, morve forward OR
                 - grab nospace to delimit remainder
            ){1}
            (.*)$ - grab remainder for later parsing
        */
       
        reAttrCombinator = /^(?:\[){1}([\w\.\:]*)(\||\!|\~|\^|\*|\$|\=|){1}(?:\=)?("|\')?([^\]]*)/,
        /*
            reAttrCombinator:
            ^(?:\[){1} - dispose of brace
            ([\w\.\:]*) - grab attribute name
            (
                \|| - grab "|" combinator OR
                \!| - grab "!" combinator OR
                \~| - grab "~" combinator OR
                \^| - grab "^" combinator OR
                \*| - grab "*" combinator OR
                \$| - grab "$" combinator OR
                \=| - grab "=" combinator OR nothing
            ){1}
            (?:\=)? - dispose of remaining equal sign, if present
            (\"|\')? - grab the beginning quote, if present
            ([^\]]*) - grab the value of the expression.
        */
        reIdCombinator = /(?:#){1}([^\s]*)/,
        reChildCombinator = /(?:[>\s]*)(.*)/,
        rePlusCombinator = /(?:[\+\s]*)(.*)/,
        reTildeCombinator = /(?:[~\s]*)(.*)/,
        reClassCombinator = /(?:[\.]{1})(.*)/,
        reColonCombinator = /^(?:\:){1}([^\(]*)(?:\(?)([^\)]*)/,
        /*
            ^(?:\:){1} - dispose of one, exactly one, occurence of the colon
            ([^\(]*) - grab all characters that aren't a right parenthesis
            (?:\(?) - dispose of the right parenthesis
            ([^\)]*) - grab all characters that aren't a left parenthesis
        */
        reNthParser = /(?:\s*)(\-?)(odd|even|[\d]*){1}(n?)(?:\s*)([\-+]?)(?:\s*)([\d]*)/,
        /*
            (?:\s*) - dispose of all beginning white  space
            (\-?) - grab negative operator if present
            (odd|even|\-?[\d]?){1} - grab one occurence of the word 'odd', or 'even', or an integer
            (n?) - grab one or zero occurences of the letter 'n'
            (?:\s*) - dispose of white  space after integer or 'n'
            (\-|\+)? - grab one or zero occurences of a minus or plus sign
            (?:\s*) - dispose of white space
            ([\d]*) - grab integer
        */
       //This small RegExp is for the "is" function, to see what very basic identifying selector is present
        reIs = /^([\.\[#\:]?)(.*)/,
        reClass = /[\n\t\r]/g,
        reIsNum = /^\s*\-?\d*\s*$/,
        reWhite = /^\s+|\s+$/g,
        reHasWhite = /\s/,
 
        removeWhite = String.prototype.trim ?
            function(string){
                return string.trim();
            }
            :
            function(string){
                //notice reWhite, just two lines above, this removes whitespace from the ends of strings.
                return string.replace(reWhite,'');
            },
        //some utilities
        slice = Array.prototype.slice,
        
        isArray = Array.isArray ?
            Array.isArray 
            : 
            function(obj){
                return Object.prototype.toString.call(obj) === '[object Array]';  
            },
        //cache last selector to help error reporting;
        lastSelector,
        
    ERROR = function(){
        throw lastSelector + (e ? e : ' - is invalid sytax.');
    },
   
    Punch = function(selector,context){
        context = context || document;
        var results = [],
            l,i
        //If the context is neither the document nor an element then return
        if(context.nodeType !== 1 && context.nodeType !== 9){
            return results;
        }

        if(!selector || typeof selector !== 'string'){
            return results;
        }
        //Parse comma is slower than native-code "split", use it if there are no parens
        selector = selector.indexOf(')') > -1 ? parseComma(selector) : selector.split(',');
      
        if(!isArray(context)) context = [context];
        //cycle through the simple selectors
        try{
            for(l = selector.length, i = 0; i < l; i++){
                results = results.concat(select(selector[i],context));
            }
        } catch(e){
            ERROR(e);
        }
        /*There is a possible optimization here; if there was never a comma in the master selector
        then it is possible that this may not to get sorted, look into it. IE if selector length is
        exactly equal to 1.
        */
        return sortAll(results);
    },

    parseComma = function(selector,index,collected){
        index = index || 0;
        collected = collected || [];
        
        var nextLParen = selector.indexOf('(',index),
            nextRParen = selector.indexOf(')',index),
            nextComma = selector.indexOf(',',index);
            
        if(nextComma === -1){
        //We're done
            //If anything remains push it into the selector array,"collected".
            if(selector.length > 0) collected.push(selector);
            return collected;
        }
        
        //Example:')... , ...(' or ', ...()' OR
        //Example: '(..)..,' and there are no parens ahead
        if(nextComma < nextLParen && (nextComma > nextRParen || nextRParen > nextLParen) || nextRParen === -1){
            collected.push(selector.slice(0,nextComma));
            return parseComma(selector.slice(nextComma + 1), 0, collected);
        } else{
        //We still need to punt, because we don't know if there are parens ahead.
            return parseComma(selector, nextRParen + 1, collected);
        }
        
    },

    select = function(selector,context){
          var remainder = selector,
              newContext = [],
              first = true,
              count = 0,
              i,n,tag,space,combinator,array;
          do{
                count++;
                if(count > 100) throw ' - created an indefinite loop.';
                array = reCombinators.exec(remainder);
                lastSelector = array[0];
                tag = array[2];
                //If space is true, it means there is a space combinator present,
                //we want to act as though the first selection has a space, even if it doesn't.
                space = (first||space) ? true : (array[1].length > 0);
                combinator = array[4];
                remainder = array[5];
                first = false;
                if(tag.length > 0){
                    if(!space){
                        tag = array[2].toUpperCase();
                        for(i = context.length, n = 0; n < i; n++){
                            if(context[n].nodeName === tag || tag === '*'){
                                newContext.push(context[n]);
                            }
                        }
                    } else {
                        for(i = context.length, n = 0; n < i; n++){
                            newContext = newContext.concat(slice.call(context[n].getElementsByTagName(tag))); 
                        }
                        
                    }
                    context = newContext;
                    newContext = [];
                    //there may be a second space after the tag, see if it's there
                    space = array[3].length > 0;
                }
                if(combinator.length > 0){
                    context = newContext.concat(combinators[combinator.charAt(0)](combinator,context,space));
                    //the space is used up
                    space = false;
                    newContext = [];
                }
            } while(remainder);
            
            return context;
    },
    
    combinators = {
        '[':function(combinator,context,space){
            combinator = reAttrCombinator.exec(combinator);
            context = space ? getContext(context) : context;
            var attribute = combinator[1],
                operator = combinator[2] ? combinator[2]: ' ',
                quote = combinator[3],
                value = combinator[4],
                newContext = [],
                i = context.length,
                method,attr;
                
            if(quote || reHasWhite.test(value)){
                if(!quote || quote !== value.slice(-1)) throw ' - invalid attribute syntax';
                value = value.slice(0,-1);
            }
            method = attrOperators[operator](value);
            while(i--){
                attr = context[i].getAttribute(attribute);
                if(attr && method(attr)){
                    newContext.unshift(context[i]);
                }
            }
            return newContext;
        },
        
        '#': function(combinator,context,space){
            combinator = reIdCombinator.exec(combinator);
            context = space ? getContext(context) : context;
            var newContext = [],
                i = context.length,
                id = combinator[1];
            while(i--){
                if(context[i].id === id){
                    newContext.unshift(context[i]);
                }
            }
            return newContext;
        },
        
        '>' : function(combinator,context){
            combinator = reChildCombinator.exec(combinator);
            var newContext = [];
            for(var i = context.length, n = 0; n < i; n++){
                newContext = newContext.concat(getChildren(context[n]));
            }
            return newContext;
            
        },
        
        '+' : function(combinator,context){
            combinator = rePlusCombinator.exec(combinator);
            var newContext = [],
                i = context.length,
                tmp;
            while(i--){
                tmp = nextElement(context[i]);
                if(tmp !== null){
                    newContext.unshift(tmp);
                }
            }
            return newContext;
        },
        
        '~' : function(combinator,context){
            combinator = reTildeCombinator.exec(combinator);
            var newContext = [];
            
            for(var i = context.length, n = 0; n < i; n++){
                newContext = newContext.concat(getAllNextSiblings(context[n]));
            }
            return newContext;
        },
        
        '.' : function(combinator,context,space){
            combinator = reClassCombinator.exec(combinator);
            context = space ? getContext(context) : context;
            var newContext = [],
                i = context.length,
                isClass = hasClass(combinator[1]);
            while(i--){
                if(isClass(context[i])){
                    newContext.unshift(context[i]);
                }
            }
            return newContext;
        },
        
        ':':function(combinator,context,space){
            combinator = reColonCombinator.exec(combinator);
            context = space ? getContext(context) : context;
            var i = context.length,
                operator = combinator[1],
                value = combinator[2],
                newContext = [],
                method = colonOperators[operator](value);
            while(i--){
                if(method(context[i],i)){
                    newContext.unshift(context[i]);
                }
            }
            return newContext;
        }
    },
    
    attrOperators = {
        '|' : function(value){
            var val = value;
            return function(attr){
                return attr.split('-')[0] === val;
            };
        },
        
        '*' : function(value){
            var val = value;
            return function(attr){
                return attr.indexOf(value) > -1;
            };
        },
        
        '~' : function(value){
            var val = ' ' + value + ' ';
            return function(attr){
                return (' ' + attr + ' ').replace(reClass, ' ').indexOf(val) > -1;
            };
        },
        
        '!' : function(value){
            var val = value;
            return function(attr){
                return val !== attr;
            };
        },
        
        '$' : function(value){
            var re = new RegExp(value+'$');
            return function(attr){
                return re.test(attr);
            };
        },
        
        '^' : function(value){
            var re = new RegExp('^'+value);
            return function(attr){
                return re.test(attr);
            };
        },
        
        '=' : function(value){
            var val = value;
            return function(attr){
                return val === attr;
            };
        },
        
        ' ': function(){
            return function(attr){
                return attr;    
            };
        }
    },
    
    colonOperators = {
        'nth-child': function(value){
            return nth(value,function(number,offset,n){
                if(n){
                    return function(element){
                        var parentsChildren = getChildren(element.parentNode),
                            index = parentsChildren.length,
                            tmp;
                        while(
                            index-- && parentsChildren[index] !== element  
                        );
                        index++;
                        return number === 0 ? (index - offset) === 0 ? true : false : (tmp = ((index - offset) / number), tmp >= 0 && (tmp % 1) === 0);
                    };
                 } else{
                    number--;
                    return function(element){
                        return getChildren(element.parentNode)[number] === element;
                    };
                }
            });
        },
        
        'nth-last-child':function(value){
            return nth(value,function(number,offset,n){
                return function(element){
                      var parentsChildren = getChildren(element.parentNode),
                          length = parentsChildren.length,
                          index = length,
                          tmp;
                      while(
                          index-- && parentsChildren[index] !== element  
                      );
                      index = length - index;
                      return n ? number === 0 ? (index - offset) === 0 ? true : false : (tmp = ((index - offset) / number), tmp >= 0 && (tmp % 1) === 0) : index === number;

                }; 
            });  
        },
        
        'nth':function(value){
            return nth(value,function(number,offset,n){
                return function(element,index){
                    var tmp;
                    index++;
                    return n ? number === 0 ? (index - offset) === 0 ? true : false : (tmp = ((index - offset) / number), tmp >= 0 && (tmp % 1) === 0) : (number - 1) === index;

                };
           });
        },
        
        'nth-of-type':function(value){
            return nth(value,function(number,offset,n){
                return function(element){
                    var parentsChildren = getChildren(element.parenNode),
                        i = parentsChildren.length,
                        nodeName = element.nodeName,
                        index = 0;
                        count = 0,
                        tmp;
                    while(index < i){
                        if(nodeName === parentsChildren[index].nodeName) count++;
                        if(element === parentsChildren[index]) break;
                    }
                    return n ? number === 0 ? (count - offset) === 0 ? true : false : (tmp = ((count - offset) / number), tmp >= 0 && (tmp % 1) === 0) : (number - 1) === count;
                 };
            });  
        },
        
        'first-child': function(){
            return function(element){
                return element === getChildren(element.parentNode)[0];
            };
        },
        
        'last-child': function(){
            return function(element){
                var tmp = getChildren(element.parentNode);
                return element === tmp[tmp.length - 1];
            };
        },
        
        'checked':function(){
            return function(element){
                return element.checked;
            };
        },
        
        'not': function(value) {
            value = value.split(',');
            
            return function(element){
                var bool = false,
                    n = value.length - 1;
                while(
                    bool = !is(element,value[n]),
                    bool && n--
                );
                return bool;
            };
        },
        
        'disabled': function(){
            
            return function(element){
                return (element.disabled && element.type !== 'hidden');
            };
        },
        
        'enabled': function(){
            
            return function(element){
                return !element.disabled;
            };
        },
        
        'selected': function(){
            
            return function(element){
                return element.selected;
            };
        },
        
        'link': function(){
            
            return function(element){
                return element.href;
            };
        },
        
        'empty': function(){
            
            return function(element){
                return !element.firstChild;
            };
        },
        
        'root': function(){
            
            return function(element){
                return element.parentNode === window.document;
            };
        }
        
    },
    
    getContext = function(context){
        var newContext = [];
        for(var l = context.length, i = 0; i < l; i++){
            newContext = newContext.concat(slice.call(context[i].getElementsByTagName('*')));
        }
        return newContext;
    },
    
    is = function(element,selector){
        selector = selector.split(',');
        var i = selector.length,
            bool = true,
            tmp;
        while(i--){
            tmp = reIs.exec(selector[i]);
            switch(tmp[1]){
                case '.':
                    bool = hasClass(tmp[2])(element);
                    break;
                case '#':
                    bool = (element.id === tmp[2]);
                    break;
                case '[':
                    bool = (combinators['[']('['+tmp[2],[element],false).length > 0);
                    break;
                case ':':
                    bool = (combinators[':'](':'+tmp[2],[element],false).length > 0);
                    break;
                default:
                    bool = element.nodeName === removeWhite(selector[i]).toUpperCase();
            }
            if(!bool) break;
        }
        return bool;
    },
    
    nth = function(value,func){
        value = reNthParser.exec(value);
            var number = value[2] !== '' ? value[2] : 1,
                n = value[3] ? true : false,
                offset = value[5] ? value[4] + value[5] : '0';
            if(!reIsNum.test(number)){
                offset = number === 'even' ? '0' : '1';
                number = '2';
                n = true;
            }
            number = parseInt(value[1] + number,10);
            offset = parseInt(offset, 10);
            return func(number,offset,n)
    },
    
    //tmp variable used by other functions to determine things.
    el,
    nextElement = (el = document.createElement('div'),
        el.innerHTML = '<i></i><span></span>',
        el = el.getElementsByTagName('i')[0],
        el.nextElementSibling) 
        ?
        function(element){
            return element.nextElementSibling;
        }
        :
        function(node){
            if(node.nextSibling.nodeType === 1 || node.nextSibling === null){
                return node.nextSibling;
            } else{
                return nextElement(node.nextSibling);
            }
        },
    
    getChildren = (el = document.createElement('div'),
        el.innerHTML = '<i></i><!--a--><span></span>',
        el.children[1].nodeType === 1)
        ?
        function(element){
            return slice.call(element.children);
        }
        :
        function(element){
            var nodes = element.children,
                i = nodes.length,
                arr = [];
                    
            while(i--){
                if(nodes[i].nodeType !== 8){
                    arr.unshift(nodes[i]);
                }
            }
                    
            return arr;
        },
    
    getAllNextSiblings = function(element){
        var arr = [],
            tmp;
        
        while(tmp = nextElement(element), tmp){
            arr.push(tmp);
            element = tmp;
        }
        
        return arr;
    },
    
    getElementsByClass = (el = document.createElement('div'),
        el.innerHTML = '<i class="foo"></i>',
        el.getElementsByClassName('foo'))
        ?
        function(element,className){
            return slice.call(element.getElementsByClassName(className));
        }
        :
        function(element,className){
            className = ' ' + className + ' '
                
            var array = slice.call(element.getElementsByTagName('*')),
                i = array.length,
                newArr = [];
                    
            while(i--){
                    
                if( (' ' + array[i].className + ' ').replace(reClass, ' ').indexOf( className ) > -1 ){
                    newArr.unshift(array[i]);
                }
            }
                
            return newArr;
        },
    
    hasClass = function(value){
       var val = ' ' + value + ' ';
       return function(element){
            return (' ' + element.className + ' ').replace(reClass, ' ').indexOf(val) > -1;
       }
    },
    
    sortElements = document.documentElement.compareDocumentPosition ?
           function(a,b){
                if ( a === b ) {
                    hasDuplicate = true;
                    return 0;
                }

                if ( !a.compareDocumentPosition || !b.compareDocumentPosition ) {
                    return a.compareDocumentPosition ? -1 : 1;
                }

                return a.compareDocumentPosition(b) & 4 ? -1 : 1;
           }
           :
           function(a,b){
                if ( a === b ) {
                    hasDuplicate = true;
                    return 0;
                } else if ( a.sourceIndex && b.sourceIndex ) {
                    return a.sourceIndex - b.sourceIndex;
                }
            },
        
        
    hasDuplicate = false,
    
    sortAll = function(elements){
        hasDuplicate = false;
        elements = elements.sort(sortElements);
        
        if(hasDuplicate){
            var array = [];
            for(var i = elements.length, n = 0; n < i; n++){
                if(elements[n] !== elements[n+1]){
                    array.push(elements[n]);
                }
            }
            return array;
        }
        
        return elements;
    }
    window.Punch = Punch;
}());