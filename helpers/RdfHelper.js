const _ = require('lodash');


/**
 * @param {object} root  result of xml2js, or some child node
 * @param {string[]} path
 * @return {[]}
 */
exports.traverseDownAndAggregate = function traverseDownAndAggregate(root, path){
    if(!root){
        return [];
    }
    let stack = [root];
    for(let step of path){
        let newStack = [];
        for(let node of stack){
            if(step in node){
                let child = node[step];
                if(_.isArray(child)){
                    newStack.push(...child);
                }
                else {
                    newStack.push(child);
                }
            }
        }
        stack = newStack;
        if(!stack.length) break;
    }
    return stack;
}