(function(){
    var combinators = /^(\s*)([\w\*]*)(\s*)(>(?:[\s]*)[^\s]*|~(?:\s*)[^\s]*|\+(?:\s*)[^\s]*|#[\w\-]*|\[[\w\-\:\.\|"\*\~\^\=\$\!\s]*\]{1}|:[\w\-]+\({1}[^\)]*\){1}|:[\w\-]*|\.[\w\-]*|){1}(.*)$/, 
        attrCombinator = /^(?:\[){1}([\w\.\:]*)(\||\!|\~|\^|\*|\$|\=){1}(?:\=)?(?:\")?([^\]\"]*)/,
        idCombinator = /(?:#){1}([^\s]*)/,
        childCombinator = /(?:[>\s]*)(.*)/,
        plusCombinator = /(?:[\+\s]*)(.*)/,
        tildeCombinator = /(?:[~\s]*)(.*)/,
        classCombinator = /(?:[\.]{1})(.*)/,
        colonCombinator = /^(?:\:){1}([^\(]*)(?:\(?)([^\)]*)/,
        reIs = /^([\.\[\#]{1})(.*)/,
        reClass = /[\n\t\r]/g,
        
        removeWhite = function(string){
            return string.replace(/^\s+|\s+$/,'');
        },
        
        slice = Array.prototype.slice,
        
        isArray = function(obj){
            return (Object.prototype.toString.call(obj).slice(8,-1) === 'Array')
        },
        
    Punch = this.Punch = function(selector,context){
        context = context || document;
        var results = [],
            temp;
        if(context.nodeType !== 1 && context.nodeType !== 9){
            return [];
        }
        
        if(!selector || typeof selector !== 'string'){
            return results;
        }
        
        selector = selector.indexOf(')') === -1 ? selector.split(',') : Punch.parseComma(selector);
        
        if(!isArray(context)) context = [context];
        
        for(var i = selector.length, n = 0; n < i; n++){
            selector[n] = removeWhite(selector[n]);
            results = results.concat(Punch.selector(selector[n],context));
        }
        
        
        return Punch.sortElements(results);
    };

    Punch.parseComma = function(selector,index,collected){
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
            return Punch.parseComma(selector.slice(nextComma + 1), 0, collected);
        } else{
        //We still need to punt, because we don't know if there are parens ahead.
            return Punch.parseComma(selector, nextRParen + 1, collected);
        }
        
    };

    Punch.selector = function(selector,context,forceCheck){
       var remainder = selector,
          newContext = [],
          first = true,
          i,n,tag,space,combinator,array;
          if(context.length === 0){
              return context;
          }
          do{
                array = combinators.exec(remainder)
                tag = array[2];
                space = forceCheck ? false : (first || array[1].length > 0);
                combinator = array[4];
                remainder = array[5];
                first = false;
                if(tag.length > 0){
                    space = forceCheck ? false : (array[3].length > 0);
                    if(forceCheck){
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
                }
                if(combinator.length > 0){
                    context = newContext.concat(Punch.combinators[combinator.charAt(0)](combinator,context,space));
                }
            } while(remainder)
            
            return context;
    };
    
    Punch.combinators = {
        '[':function(combinator,context,space){
            combinator = attrCombinator.exec(combinator);
            var attribute = combinator[1],
                operator = combinator[2],
                value = combinator[3],
                newContext = [],
                method = Punch.attrOperators[operator](value),
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
        
        '#' : function(combinator,context){
            combinator = idCombinator.exec(combinator);
            var newContext = [];
            for(var i = context.length, n = 0; n < i; n++){
                newContext.push(context[n].getElementById(combinator[1]));
            }
            return newContext;
        },
        
        '>' : function(combinator,context){
            combinator = childCombinator.exec(combinator);
            var newContext = [];
            for(var i = context.length, n = 0; n < i; n++){
                newContext = newContext.concat(Punch.getChildren(context[n]));
            }
            return Punch.selector(combinator[1],newContext,true);
            
        },
        
        '+' : function(combinator,context){
            combinator = plusCombinator.exec(combinator);
            var newContext = [],
                i = context.length,
                tmp;
            while(i--){
                tmp = Punch.nextElement(context[i]);
                if(tmp !== null){
                    newContext.unshift(tmp);
                }
            }
            return Punch.selector(combinator[1],newContext,true);
        },
        
        '~' : function(combinator,context){
            combinator = tildeCombinator.exec(combinator);
            var newContext = [];
            
            for(var i = context.length, n = 0; n < i; n++){
                newContext = newContext.concat(Punch.getAllNextSiblings(context[n]));
            }
            return Punch.selector(combinator[1],newContext,true);
        },
        
        '.' : function(combinator,context,space){
            combinator = classCombinator.exec(combinator);
            var newContext = [],
                i = context.length,
                hasClass;
            if(space){
                for(var n = 0; n < i; n++){
                    newContext = newContext.concat(Punch.getElementsByClass(context[n],combinator[1]));
                }
            } else {
                hasClass = Punch.hasClass(combinator[1]);
                while(i--){
                    if(hasClass(context[i])){
                        newContext.unshift(context[i]);
                    }
                }
            }
            return newContext;
        },
        ':':function(combinator,context,space){
            combinator = colonCombinator.exec(combinator);
            var l = context.length,
                operator = combinator[1],
                value = combinator[2],
                newContext = [],
                elements,i,tmp;
            if(space){
                while(l--){
                    elements = slice.call(context[l].getElementsByTagName('*'));
                    i = elements.length;
                    while(i--){
                        tmp = Punch.colonOperators[operator](elements[i],value);
                        if(tmp !== null){
                            newContext.unshift(tmp);
                        }
                    }
                }
            } else {
                while(l--){
                    tmp = Punch.colonOperators[operator](context[l],value);
                    if(tmp !== null){
                        newContext.unshift(tmp);
                    }
                }
            }
            return newContext;
        }
    };
    
    Punch.attrOperators = {
        '|' : function(value){
            var val = value;
            return function(attr){
                return attr.split('-')[0] === val;
            }
        },
        
        '*' : function(value){
            var val = value
            return function(attr){
                return attr.indexOf(value) > -1;
            }
        },
        
        '~' : function(value){
            var val = ' ' + value + ' ';
            return function(attr){
                return (' ' + attr + ' ').replace(reClass, ' ').indexOf(val) > -1;
            }
        },
        
        '!' : function(value){
            var val = value;
            return function(attr){
                return !(val === attr);
            }
        },
        
        '$' : function(value){
            var re = new RegExp(value+'$');
            return function(attr){
                return re.test(attr);
            }
        },
        
        '^' : function(value){
            var re = new RegExp('^'+value);
            return function(attr){
                return re.test(attr);
            }
        },
        
        '=' : function(value){
            var val = value;
            return function(attr){
                return val === attr;
            }
        }
    };
    
    Punch.colonOperators = {
        'nth-child': function(context,value){
            context = Punch.getChildren(context)[parseInt(value) - 1];
            return context ? context : null;
        },
        
        'nth-last-child': function(context, value){
            context = Punch.getChildren(context);
            context = context[context.length - 1 - parseInt(value)];
            return context ? context : null;
        },
        
        'first-child': function(context){
            context = context.firstChild;
            return context ? context : null;
        },
        
        'last-child': function(context){
            context = context.lastChild;
            return context ? context : null;
        },
        
        'checked':function(context){
            return context.checked ? context : null;
        },
        
        'not': function(context,value) {
            value = value.split(',');
            var i = value.length,
                bool = true;
            while(i--){
                bool = !Punch.is(context,value[i]);
                if(!bool) break;
            }
            return bool ? context : null;
        },
        
        'disabled': function(context){
            return context.disabled ? context : null;
        },
        
        'enabled': function(context){
            return context.disabled ? null : context;
        },
        
        'selected': function(context){
            return context.selected ? context : null;
        },
        
        'parent': function(context){
            var num = context.parentNode.nodeType
            return (num === 1 || num === 9) ? context.parentNode : null;
        }
    };
    
    Punch.is = function(element,selector){
        selector = selector.split(',');
        var i = selector.length,
            bool = true,
            tmp;
        while(i--){
            tmp = reIs.exec(selector[i]);
            switch(tmp[1]){
                case '.':
                    bool = Punch.hasClass(tmp[2])(element);
                    break;
                case '#':
                    bool = (element.id === tmp[2]);
                    break;
                case '[':
                    bool = (Punch.combinators['[']('['+tmp[2],[element],false).length > 0);
                    break;
            }
            if(!bool) break;
        }
        return bool;
    };
    
    Punch.nextElement = function(){
        var el = document.createElement('div');
            
            el.innerHTML = '<i></i><span></span>';
            el = el.getElementsByTagName('i')[0];
        
        if(el.nextElementSibling){
            delete el;
            
            return function(element){
                return element.nextElementSibling;
            }
        } else {
            delete el;
            
            return function(node){
                
                if(node.nextSibling.nodeType === 1 || node.nextSibling === null){
                    return node.nextSibling;
                } else{
                    return Punch.nextElement(node.nextSibling);
                }
            }
        }
    }();
    
    Punch.getChildren = function(){
        var el = document.createElement('div');
            
            el.innerHTML = '<i></i><!--a--><span></span>';
            
            if(el.children[1].nodeType === 1){
                delete el;
                
                return function(element){
                    return slice.call(element.children);
                }
            } else {
                
                return function(element){
                    var nodes = element.children,
                        i = nodes.length,
                        arr = [];
                    
                    while(i--){
                        if(nodes[i].nodeType !== 8){
                            arr.unshift(nodes[i]);
                        }
                    }
                    
                    return arr;
                }
            }
    }();
    
    Punch.getAllNextSiblings = function(element){
        var arr = [],
            tmp;
        
        while(tmp = Punch.nextElement(element), tmp){
            arr.push(tmp);
            element = tmp;
        }
        
        return arr;
    };
    
    Punch.getElementsByClass = function(){
        var el = document.createElement('div');
        
        el.innerHTML = '<i class="foo"></i>';
        
        if(el.getElementsByClassName('foo')){
            delete el;
            
            return function(element,className){
                return slice.call(element.getElementsByClassName(className));
            };
        } else {
            delete el;
            return function(element,className){
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
            };
        }
    }();
    
    Punch.hasClass = function(value){
       var val = ' ' + value + ' ';
       return function(element){
            return (' ' + element.className + ' ').replace(reClass, ' ').indexOf(val) > -1;
       }
    };
    
    var sortElements = document.documentElement.compareDocumentPosition ?
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
        
        
        hasDuplicate = false;
    
    Punch.sortElements = function(elements){
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
    
}());

/*
/[~\[:#>+]/.exec('div#someid:not(this,that,theother)')
/(\w+)([~\[:#>+])(\w+)/.exec('div#someid:not(this,that,theother)');
/(\w+)([~\[:#>+])(\w+)/.exec('#someid:not(this,that,theother)');
/(\w*)([~\[:#>+])(\w*)(.+)/.exec('div#someid:not(this,that,theother)');
/^(\w*)([~\[:#>+])(\w*)(.*)$/.exec('div#someid:not(this,that,theother)');
/^(.*)([~\[:#>+])(\w*)(.*)$/.exec('* div');
/^(\w*)([~\[:#>+])(\w*)(.*)$/.exec('* div');
/^([\w\*]*)([~\[:#>+])([\w\*]*)(.*)$/.exec('div');
/^([\w\*]*)([~\[:#>+])([\w\*]*)(.*)$/.exec('*');
/^([\w\*]*)([~\[:#>+]*)([\w\*]*)(.*)$/.exec('div#someid:not(this,that,theother)');
/^([\w\*]*)([~\[:#>+\.]*)([\w\*]*)(.*)$/.exec('div.someid:not(this,that,theother)');
/^([\w\*]*)([~\[:#>+\.\(]*)([\w\*]*)(.*)$/.exec('div.someid:not(this,that,theother)');
/^([\w\*]*)([~\[:#>+\.]*)([\w\*\(\)]*)(.*)$/.exec(':not(this,that,theother)');
/^([\w\*]*)([~\[\:#>\+\.\s]){1}([\w[~\[:#>\+\.\=\(,\!\^\*]*)(?:[\]\)]){1}(.*)$/.exec('div[attr*=something][attr=7]:not(this,that,theother) and.somethingelse');
/^([\w\*]*)([~\[\:#>\+\.\s]){1}([\w~\[:#>\+\.\=\(,\!\^\*\s])*(?:[\]\)\s]){1}(.*)$/.exec('ul li.class');
/^([\w\*]*)([~#>\[\+\.]|\s|\:[\(\w\s\,]*){1}([\w~\[:#>\+\.\=\!\^\*]*)(?:\)|\]|\s|){1}(.*)$/
/^([\w\*]*)([~#>\[\+\.]|\s|\:[\(\w\s\,]*){1}([\w~\[#>\+\.\=\!\^\*]*)(?:\)|\]|\s|){1}(.*)$/
/([\w\*]*)(\s|#[\w\-]*|\[[\w\-\*\^\=\$\!]*\]{1}|**RIGHTHERE**>[\s]{0,1}[\w\*]*[^\]**ENDHERE**|:[\w\-]+\({1}[\w\-\*:\.\,\#\s]*\){1}|:[\w\-]+[\w\-\*\.\#\s]*|\.[\w\-]*|){1}(.*)/.exec('ulli')
/^([\w\*]*)(?:\s*)(>\s*|~\s*|\+\s*|#[\w\-]*|\[[\w\-\|\*\^\=\$\!]*\]{1}|:[\w\-]+\({1}[\w\-\*:\.\,\#\s]*\){1}|:[\w\-]+[\w\-\*\.\#\s]*|\.[\w\-]*|){1}(?:\s*)(.*)$/.exec('[attr|=some] [anotherattr!=something]')
/^(\s*)([\w\*]*)(\s*)(>(?:[\s]*)[^\s]*|~(?:\s*)[^\s]*|\+(?:\s*)[^\s]*|#[\w\-]*|\[[\w\-\:\.\|"\*\~\^\=\$\!\s]*\]{1}|:[\w\-]+\({1}[^\)]*\){1}|:[\w\-]*|\.[\w\-]*|){1}(.*)$/
* * */