export function inherits(ctor, parent) {
  ctor.super_ = parent;
  ctor.prototype = Object.create(parent.prototype, {constructor:{value:ctor,enumerable:false,writable:true,configurable:true}});
}
