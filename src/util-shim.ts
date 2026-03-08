// Minimal shim for Node.js 'util' module used by opl3
export function inherits(
  ctor: { prototype: object; super_?: unknown },
  superCtor: { prototype: object }
): void {

  ctor.super_ = superCtor;
  ctor.prototype = Object.create( superCtor.prototype, {
    constructor: { value: ctor, enumerable: false, writable: true, configurable: true }
  } );

}

export default { inherits };
