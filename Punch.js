(function(){
    'use strict';
    /*
        To do:
        1. Start banging away at some cross browser bugs
        2. Implement qSA
        3. update class and id selector attributes to allow for appropriate UTF-8 values
        4. Add more descriptive and better comments
        5. refactor pseudo-controller to handle context, rather than the sub-function. Low-priority.
    */
    var reCombinators = RegExp('^(\\s*)([A-Za-z0-9\\*]*)(\\s*)(>(?:\\s*)|~(?:\\s*)|\\+(?:\\s*)|#[\\w\\u00c0-\\uFFFF\\-]*|\\[[\\w\\-\\:\\.\\|"\\*\\~\\^\\=\\$\\!\\s]*\\]{1}|:[\\w\\-]*\\({1}[^\\)]*\\){1}|:[\\w\\-]*|\\.[\\w\\u00c0-\\uFFFF\\-]*|){1}(.*)$'), 
        /*
            combinators:
            ^(\\s*) - grab white space preceding tagName, means it descends from.
            ([A-Za-z0-9\\*]*) - grab tag name
            (\\s*) - grab white space proceding tagName, all the tagNames have descendent selectors.
            (
                >(?:[\\s]*)| - grab children selector, move forward OR
                ~(?:\\s*)| - grab general next sibling selector, move forward OR
                \\+(?:\\s*)| - grab immediate next sibling selector, move forward OR
                #[\\w\\-]*| - grab id selector, move forward OR
                \\[[\\w\\-\\:\\.\\|"\\*\\~\\^\\=\\$\\!\\s]*\\]{1}| - grab attribute selector, move forward OR
                :[\\w\\-]*\\({1}[^\\)]*\\){1}| - grab pseudo-selector WITH parentheses, move forward OR 
                :[\\w\\-]*| - - grab pseudo-selector WITHOUT parentheses, move forward OR
                \\.[\\w\\-]*| - grab class-selector and relevant values, morve forward OR
                 - grab nospace to delimit remainder
            ){1}
            (.*)$ - grab remainder for later parsing
        */
        reAttrCombinator = RegExp('^(?:\\[){1}([\\w\\.\\:]*)(\\||\\!|\\~|\\^|\\*|\\$|\\=|){1}(?:\\=)?(?:\\")?([^\\]\\"]*)'),
        /*
            reAttrCombinator:
            ^(?:\\[){1} - dispose of brace
            ([\\w\\.\\:]*) - grab attribute name
            (
                \\|| - grab "|" combinator OR
                \\!| - grab "!" combinator OR
                \\~| - grab "~" combinator OR
                \\^| - grab "^" combinator OR
                \\*| - grab "*" combinator OR
                \\$| - grab "$" combinator OR
                \\=| - grab "=" combinator OR nothing
            ){1}
            (?:\\=)? - dispose of remaining equal sign, if present
            (?:\\")? - dispose of beginning quoute, if present
            ([^\\]\\"]*) - grab the value of the expression.
        */
        reIdCombinator = RegExp('(?:#){1}([^\\s]*)'),
        reChildCombinator = RegExp('(?:[>\\s]*)(.*)'),
        rePlusCombinator = RegExp('(?:[\\+\\s]*)(.*)'),
        reTildeCombinator = RegExp('(?:[~\\s]*)(.*)'),
        reClassCombinator = RegExp('(?:[\\.]{1})(.*)'),
        reColonCombinator = RegExp('^(?:\\:){1}([^\\(]*)(?:\\(?)([^\\)]*)'),
        /*
            ^(?:\\:){1} - dispose of one, exactly one, occurence of the colon
            ([^\\(]*) - grab all characters that aren't a right parenthesis
            (?:\\(?) - dispose of the right parenthesis
            ([^\\)]*) - grab all characters that aren't a left parenthesis
        */
        reNthParser = RegExp('(?:\\s*)(odd|even|\\-?[\\d]+){1}(n?)(?:\\s*)([\\-+]?)(?:\\s*)([\\d]*)'),
        /*
            (?:\\s*) - dispose of all beginning white  space
            (odd|even|\\-?[\\d]+){1} - grab one occurence of the word 'odd', or 'even', or an integer
            (n?) - grab one or zero occurences of the letter 'n'
            (?:\\s*) - dispose of white  space after integer or 'n'
            (\\-|\\+)? - grab one or zero occurences of a minus or plus sign
            (?:\\s*) - dispose of white space
            ([\\d]*) - grab integer
        */
       //This small RegExp is for the "is" function, to see what very basic identifying selector is present
        reIs = RegExp('^([\\.\\[#\\:]?)(.*)'),
        reClass = new RegExp('[\\n\\t\\r]','g'),
        reIsNum = RegExp('^\\s*\\-?\\d*\\s*$'),
        reWhite = new RegExp('^\\s+|\\s+$','g'),
 
        removeWhite = function(string){
            //notice reWhite, just two lines above, this removes whitespace from the ends of strings.
            return string.replace(reWhite,'');
        },
        //some utilities
        slice = Array.prototype.slice,
        
        isArray = function(obj){
            return Object.prototype.toString.call(obj) === '[object Array]';  
        },
        
    Punch = function(selector,context){
        context = context || document;
        var results = [],
            temp;
        //If the context is neither the document nor an element then return
        if(context.nodeType !== 1 && context.nodeType !== 9){
            return [];
        }

        if(!selector || typeof selector !== 'string'){
            return [];
        }
        //Parse comma is slower than native-code "split", use it if there are no parens
        selector = selector.indexOf(')') === -1 ? selector.split(',') : parseComma(selector);
        
        if(!isArray(context)) context = [context];
        //cycle through the simple selectors
        for(var i = selector.length, n = 0; n < i; n++){
            results = results.concat(select(selector[n],context));
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
            if(selector.length > 0) collected.push(selector);
            return collected;
        }
        
        if(nextComma < nextLParen && (nextComma > nextRParen || nextRParen > nextLParen) || nextRParen === -1){
        //Example:')... , ...(' or ', ...()' OR
        //Example: '(..)..,' and there are no parens ahead
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
              i,n,tag,space,combinator,array;
              
          do{
                array = reCombinators.exec(remainder);
                tag = array[2];
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
                        context = newContext;
                        newContext = [];
                    } else {
                        for(i = context.length, n = 0; n < i; n++){
                            newContext = newContext.concat(slice.call(context[n].getElementsByTagName(tag))); 
                        }
                        context = newContext;
                        newContext = [];
                    }
                    space = array[3].length > 0;
                }
                if(combinator.length > 0){
                    context = newContext.concat(combinators[combinator.charAt(0)](combinator,context,space));
                    space = false;
                }
            } while(remainder);
            
            return context;
    },
    
    combinators = {
        '[':function(combinator,context,space){
            combinator = reAttrCombinator.exec(combinator);
            var attribute = combinator[1],
                operator = combinator[2] ? combinator[2]: ' ',
                value = combinator[3],
                newContext = [],
                method = attrOperators[operator](value),
                l = context.length,
                attr, elements, i;
            if(space){
                while(l--){
                    elements = slice.call(context[l].getElementsByTagName('*'));
                    i = elements.length;
                    while(i--){
                        attr = elements[i].getAttribute(attribute);
                        if(attr && method(attr)){
                            newContext.unshift(elements[i]);
                        }
                    }
                }
            } else {
                while(l--){
                    attr = context[l].getAttribute(attribute);
                    if(attr && method(attr)){
                        newContext.unshift(context[l]);
                    }
                }
            }
            return newContext;
        },
        
        '#': function(combinator,context,space){
            combinator = reIdCombinator.exec(combinator);
            var newContext = [],
                i = context.length,
                id = combinator[1];
            if(space){
                for(var n = 0; n < i; n++){
                    newContext.push(context[n].getElementById(id));
                }
            } else {
                while(i--){
                    if(context[i].id === id){
                        newContext.unshift(context[i]);
                    }
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
            var newContext = [],
                i = context.length,
                isClass;
            if(space){
                for(var n = 0; n < i; n++){
                    newContext = newContext.concat(getElementsByClass(context[n],combinator[1]));
                }
            } else {
                isClass = hasClass(combinator[1]);
                while(i--){
                    if(isClass(context[i])){
                        newContext.unshift(context[i]);
                    }
                }
            }
            return newContext;
        },
        ':':function(combinator,context,space){
            combinator = reColonCombinator.exec(combinator);
            var l = context.length,
                operator = combinator[1],
                value = combinator[2],
                newContext = [],
                n = 0;
            if(space){
                while(n < l){
                    newContext = newContext.concat(colonOperators[operator](slice.call(context[n].getElementsByTagName('*')),value));
                    n++;
                }
            } else {
                newContext = colonOperators[operator](context,value);
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
        'nth-child': function(context,value){
            value = reNthParser.exec(value);
            var number = value[1] !== '' ? value[1] : 1,
                n = value[2] ? true : false,
                offset = value[4] ? value[3]+value[4] : '0',
                newContext = [],
                i = context.length,
                element,parentsChildren,index,length,tmp,check,times;
            if(!reIsNum.test(number)){
                offset = number === 'even' ? '0' : '1';
                number = '2';
                n = true;
            }
            number = parseInt(number,10);
            if(n){
                offset = parseInt(offset, 10);
                while(i--){
                    element = context[i];
                    parentsChildren = getChildren(element.parentNode);
                    index = length = parentsChildren.length;
                    times = Math.floor(length/Math.abs(number));
                    check = 0;
                    while(
                        index-- && parentsChildren[index] !== element
                    );
                    index++;
                    while(check <= times){
                        tmp = (check * number) + offset;
                        if(tmp === index) newContext.unshift(element);
                        check++;
                    }
                }
            } else{
                while(i--){
                    if(getChildren(context[i].parentNode)[number - 1] === context[i]){
                        newContext.unshift(context[i]);
                    }
                }
            }
            
            return newContext;
        },
        
        'first-child': function(context){
            var i = context.length,
                newContext = [];
            while(i--){
                if(context[i] === getChildren(context[i].parentNode)[0]){
                    newContext.unshift(context[i]);
                }
            }
            return newContext;
        },
        
        'last-child': function(context){
            var i = context.length,
                newContext = [],
                tmp;
            while(i--){
                tmp = getChildren(context[i].parentNode);
                if(context[i] === tmp[tmp.length - 1]){
                    newContext.unshift(context[i]);
                }
            }
            return newContext;
        },
        
        'checked':function(context){
            var i = context.length,
                newContext = [];
            while(i--){
                if(context[i].checked){
                    newContext.unshift(context[i]);
                }
            }
            return newContext;
        },
        
        'not': function(context,value) {
            value = value.split(',');
            var i = context.length,
                newContext = [],
                bool, n;
            while(i--){
                n = value.length - 1;
                bool = false;
                while(
                    bool = !is(context[i],value[n]),
                    bool && n--
                );
                if(bool) newContext.unshift(context[i]);
            }
            return newContext;
        },
        
        'disabled': function(context){
            var i = context.length,
                newContext = [];
            while(i--){
                if(context[i].disabled && context[i].type !== 'hidden'){
                    newContext.unshift(context[i]);
                }
            }
            return newContext;
        },
        
        'enabled': function(context){
            var i = context.length,
                newContext = [];
            while(i--){
                if(!context[i].disabled){
                    newContext.unshift(context[i]);
                }
            }
            return newContext;
        },
        
        'selected': function(context){
            var i = context.length,
                newContext = [];
            while(i--){
                if(context[i].selected){
                    newContext.unshift(context[i]);
                }
            }
            return newContext;
        },
        
        'link': function(context){
            var i = context.length,
                newContext = [],
                tmp;
            while(i--){
                if(context[i].href){
                    newContext.unshift(context[i]);
                }
            }
            return newContext;
        },
        
        'empty': function(context){
            var i = context.length,
                newContext = [];
            while(i--){
                if(!context[i].firstChild){
                    newContext.unshift(context[i]);
                }
            }
            return newContext;
        },
        
        'root': function(context){
            var i = context.length,
                newContext = [];
            while(i--){
                if(context[i].parentNode === window.document){
                    newContext.unshift(context[i]);
                }
            }
            return newContext;
        }
        
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