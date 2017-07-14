"use strict";
(function() {

Error.stackTraceLimit = Infinity;

var $global, $module;
if (typeof window !== "undefined") { /* web page */
  $global = window;
} else if (typeof self !== "undefined") { /* web worker */
  $global = self;
} else if (typeof global !== "undefined") { /* Node.js */
  $global = global;
  $global.require = require;
} else { /* others (e.g. Nashorn) */
  $global = this;
}

if ($global === undefined || $global.Array === undefined) {
  throw new Error("no global object found");
}
if (typeof module !== "undefined") {
  $module = module;
}

var $packages = {}, $idCounter = 0;
var $keys = function(m) { return m ? Object.keys(m) : []; };
var $flushConsole = function() {};
var $throwRuntimeError; /* set by package "runtime" */
var $throwNilPointerError = function() { $throwRuntimeError("invalid memory address or nil pointer dereference"); };
var $call = function(fn, rcvr, args) { return fn.apply(rcvr, args); };
var $makeFunc = function(fn) { return function() { return $externalize(fn(this, new ($sliceType($jsObjectPtr))($global.Array.prototype.slice.call(arguments, []))), $emptyInterface); }; };
var $unused = function(v) {};

var $mapArray = function(array, f) {
  var newArray = new array.constructor(array.length);
  for (var i = 0; i < array.length; i++) {
    newArray[i] = f(array[i]);
  }
  return newArray;
};

var $methodVal = function(recv, name) {
  var vals = recv.$methodVals || {};
  recv.$methodVals = vals; /* noop for primitives */
  var f = vals[name];
  if (f !== undefined) {
    return f;
  }
  var method = recv[name];
  f = function() {
    $stackDepthOffset--;
    try {
      return method.apply(recv, arguments);
    } finally {
      $stackDepthOffset++;
    }
  };
  vals[name] = f;
  return f;
};

var $methodExpr = function(typ, name) {
  var method = typ.prototype[name];
  if (method.$expr === undefined) {
    method.$expr = function() {
      $stackDepthOffset--;
      try {
        if (typ.wrapped) {
          arguments[0] = new typ(arguments[0]);
        }
        return Function.call.apply(method, arguments);
      } finally {
        $stackDepthOffset++;
      }
    };
  }
  return method.$expr;
};

var $ifaceMethodExprs = {};
var $ifaceMethodExpr = function(name) {
  var expr = $ifaceMethodExprs["$" + name];
  if (expr === undefined) {
    expr = $ifaceMethodExprs["$" + name] = function() {
      $stackDepthOffset--;
      try {
        return Function.call.apply(arguments[0][name], arguments);
      } finally {
        $stackDepthOffset++;
      }
    };
  }
  return expr;
};

var $subslice = function(slice, low, high, max) {
  if (low < 0 || high < low || max < high || high > slice.$capacity || max > slice.$capacity) {
    $throwRuntimeError("slice bounds out of range");
  }
  var s = new slice.constructor(slice.$array);
  s.$offset = slice.$offset + low;
  s.$length = slice.$length - low;
  s.$capacity = slice.$capacity - low;
  if (high !== undefined) {
    s.$length = high - low;
  }
  if (max !== undefined) {
    s.$capacity = max - low;
  }
  return s;
};

var $substring = function(str, low, high) {
  if (low < 0 || high < low || high > str.length) {
    $throwRuntimeError("slice bounds out of range");
  }
  return str.substring(low, high);
};

var $sliceToArray = function(slice) {
  if (slice.$array.constructor !== Array) {
    return slice.$array.subarray(slice.$offset, slice.$offset + slice.$length);
  }
  return slice.$array.slice(slice.$offset, slice.$offset + slice.$length);
};

var $decodeRune = function(str, pos) {
  var c0 = str.charCodeAt(pos);

  if (c0 < 0x80) {
    return [c0, 1];
  }

  if (c0 !== c0 || c0 < 0xC0) {
    return [0xFFFD, 1];
  }

  var c1 = str.charCodeAt(pos + 1);
  if (c1 !== c1 || c1 < 0x80 || 0xC0 <= c1) {
    return [0xFFFD, 1];
  }

  if (c0 < 0xE0) {
    var r = (c0 & 0x1F) << 6 | (c1 & 0x3F);
    if (r <= 0x7F) {
      return [0xFFFD, 1];
    }
    return [r, 2];
  }

  var c2 = str.charCodeAt(pos + 2);
  if (c2 !== c2 || c2 < 0x80 || 0xC0 <= c2) {
    return [0xFFFD, 1];
  }

  if (c0 < 0xF0) {
    var r = (c0 & 0x0F) << 12 | (c1 & 0x3F) << 6 | (c2 & 0x3F);
    if (r <= 0x7FF) {
      return [0xFFFD, 1];
    }
    if (0xD800 <= r && r <= 0xDFFF) {
      return [0xFFFD, 1];
    }
    return [r, 3];
  }

  var c3 = str.charCodeAt(pos + 3);
  if (c3 !== c3 || c3 < 0x80 || 0xC0 <= c3) {
    return [0xFFFD, 1];
  }

  if (c0 < 0xF8) {
    var r = (c0 & 0x07) << 18 | (c1 & 0x3F) << 12 | (c2 & 0x3F) << 6 | (c3 & 0x3F);
    if (r <= 0xFFFF || 0x10FFFF < r) {
      return [0xFFFD, 1];
    }
    return [r, 4];
  }

  return [0xFFFD, 1];
};

var $encodeRune = function(r) {
  if (r < 0 || r > 0x10FFFF || (0xD800 <= r && r <= 0xDFFF)) {
    r = 0xFFFD;
  }
  if (r <= 0x7F) {
    return String.fromCharCode(r);
  }
  if (r <= 0x7FF) {
    return String.fromCharCode(0xC0 | r >> 6, 0x80 | (r & 0x3F));
  }
  if (r <= 0xFFFF) {
    return String.fromCharCode(0xE0 | r >> 12, 0x80 | (r >> 6 & 0x3F), 0x80 | (r & 0x3F));
  }
  return String.fromCharCode(0xF0 | r >> 18, 0x80 | (r >> 12 & 0x3F), 0x80 | (r >> 6 & 0x3F), 0x80 | (r & 0x3F));
};

var $stringToBytes = function(str) {
  var array = new Uint8Array(str.length);
  for (var i = 0; i < str.length; i++) {
    array[i] = str.charCodeAt(i);
  }
  return array;
};

var $bytesToString = function(slice) {
  if (slice.$length === 0) {
    return "";
  }
  var str = "";
  for (var i = 0; i < slice.$length; i += 10000) {
    str += String.fromCharCode.apply(undefined, slice.$array.subarray(slice.$offset + i, slice.$offset + Math.min(slice.$length, i + 10000)));
  }
  return str;
};

var $stringToRunes = function(str) {
  var array = new Int32Array(str.length);
  var rune, j = 0;
  for (var i = 0; i < str.length; i += rune[1], j++) {
    rune = $decodeRune(str, i);
    array[j] = rune[0];
  }
  return array.subarray(0, j);
};

var $runesToString = function(slice) {
  if (slice.$length === 0) {
    return "";
  }
  var str = "";
  for (var i = 0; i < slice.$length; i++) {
    str += $encodeRune(slice.$array[slice.$offset + i]);
  }
  return str;
};

var $copyString = function(dst, src) {
  var n = Math.min(src.length, dst.$length);
  for (var i = 0; i < n; i++) {
    dst.$array[dst.$offset + i] = src.charCodeAt(i);
  }
  return n;
};

var $copySlice = function(dst, src) {
  var n = Math.min(src.$length, dst.$length);
  $copyArray(dst.$array, src.$array, dst.$offset, src.$offset, n, dst.constructor.elem);
  return n;
};

var $copyArray = function(dst, src, dstOffset, srcOffset, n, elem) {
  if (n === 0 || (dst === src && dstOffset === srcOffset)) {
    return;
  }

  if (src.subarray) {
    dst.set(src.subarray(srcOffset, srcOffset + n), dstOffset);
    return;
  }

  switch (elem.kind) {
  case $kindArray:
  case $kindStruct:
    if (dst === src && dstOffset > srcOffset) {
      for (var i = n - 1; i >= 0; i--) {
        elem.copy(dst[dstOffset + i], src[srcOffset + i]);
      }
      return;
    }
    for (var i = 0; i < n; i++) {
      elem.copy(dst[dstOffset + i], src[srcOffset + i]);
    }
    return;
  }

  if (dst === src && dstOffset > srcOffset) {
    for (var i = n - 1; i >= 0; i--) {
      dst[dstOffset + i] = src[srcOffset + i];
    }
    return;
  }
  for (var i = 0; i < n; i++) {
    dst[dstOffset + i] = src[srcOffset + i];
  }
};

var $clone = function(src, type) {
  var clone = type.zero();
  type.copy(clone, src);
  return clone;
};

var $pointerOfStructConversion = function(obj, type) {
  if(obj.$proxies === undefined) {
    obj.$proxies = {};
    obj.$proxies[obj.constructor.string] = obj;
  }
  var proxy = obj.$proxies[type.string];
  if (proxy === undefined) {
    var properties = {};
    for (var i = 0; i < type.elem.fields.length; i++) {
      (function(fieldProp) {
        properties[fieldProp] = {
          get: function() { return obj[fieldProp]; },
          set: function(value) { obj[fieldProp] = value; }
        };
      })(type.elem.fields[i].prop);
    }
    proxy = Object.create(type.prototype, properties);
    proxy.$val = proxy;
    obj.$proxies[type.string] = proxy;
    proxy.$proxies = obj.$proxies;
  }
  return proxy;
};

var $append = function(slice) {
  return $internalAppend(slice, arguments, 1, arguments.length - 1);
};

var $appendSlice = function(slice, toAppend) {
  if (toAppend.constructor === String) {
    var bytes = $stringToBytes(toAppend);
    return $internalAppend(slice, bytes, 0, bytes.length);
  }
  return $internalAppend(slice, toAppend.$array, toAppend.$offset, toAppend.$length);
};

var $internalAppend = function(slice, array, offset, length) {
  if (length === 0) {
    return slice;
  }

  var newArray = slice.$array;
  var newOffset = slice.$offset;
  var newLength = slice.$length + length;
  var newCapacity = slice.$capacity;

  if (newLength > newCapacity) {
    newOffset = 0;
    newCapacity = Math.max(newLength, slice.$capacity < 1024 ? slice.$capacity * 2 : Math.floor(slice.$capacity * 5 / 4));

    if (slice.$array.constructor === Array) {
      newArray = slice.$array.slice(slice.$offset, slice.$offset + slice.$length);
      newArray.length = newCapacity;
      var zero = slice.constructor.elem.zero;
      for (var i = slice.$length; i < newCapacity; i++) {
        newArray[i] = zero();
      }
    } else {
      newArray = new slice.$array.constructor(newCapacity);
      newArray.set(slice.$array.subarray(slice.$offset, slice.$offset + slice.$length));
    }
  }

  $copyArray(newArray, array, newOffset + slice.$length, offset, length, slice.constructor.elem);

  var newSlice = new slice.constructor(newArray);
  newSlice.$offset = newOffset;
  newSlice.$length = newLength;
  newSlice.$capacity = newCapacity;
  return newSlice;
};

var $equal = function(a, b, type) {
  if (type === $jsObjectPtr) {
    return a === b;
  }
  switch (type.kind) {
  case $kindComplex64:
  case $kindComplex128:
    return a.$real === b.$real && a.$imag === b.$imag;
  case $kindInt64:
  case $kindUint64:
    return a.$high === b.$high && a.$low === b.$low;
  case $kindArray:
    if (a.length !== b.length) {
      return false;
    }
    for (var i = 0; i < a.length; i++) {
      if (!$equal(a[i], b[i], type.elem)) {
        return false;
      }
    }
    return true;
  case $kindStruct:
    for (var i = 0; i < type.fields.length; i++) {
      var f = type.fields[i];
      if (!$equal(a[f.prop], b[f.prop], f.typ)) {
        return false;
      }
    }
    return true;
  case $kindInterface:
    return $interfaceIsEqual(a, b);
  default:
    return a === b;
  }
};

var $interfaceIsEqual = function(a, b) {
  if (a === $ifaceNil || b === $ifaceNil) {
    return a === b;
  }
  if (a.constructor !== b.constructor) {
    return false;
  }
  if (a.constructor === $jsObjectPtr) {
    return a.object === b.object;
  }
  if (!a.constructor.comparable) {
    $throwRuntimeError("comparing uncomparable type " + a.constructor.string);
  }
  return $equal(a.$val, b.$val, a.constructor);
};

var $min = Math.min;
var $mod = function(x, y) { return x % y; };
var $parseInt = parseInt;
var $parseFloat = function(f) {
  if (f !== undefined && f !== null && f.constructor === Number) {
    return f;
  }
  return parseFloat(f);
};

var $froundBuf = new Float32Array(1);
var $fround = Math.fround || function(f) {
  $froundBuf[0] = f;
  return $froundBuf[0];
};

var $imul = Math.imul || function(a, b) {
  var ah = (a >>> 16) & 0xffff;
  var al = a & 0xffff;
  var bh = (b >>> 16) & 0xffff;
  var bl = b & 0xffff;
  return ((al * bl) + (((ah * bl + al * bh) << 16) >>> 0) >> 0);
};

var $floatKey = function(f) {
  if (f !== f) {
    $idCounter++;
    return "NaN$" + $idCounter;
  }
  return String(f);
};

var $flatten64 = function(x) {
  return x.$high * 4294967296 + x.$low;
};

var $shiftLeft64 = function(x, y) {
  if (y === 0) {
    return x;
  }
  if (y < 32) {
    return new x.constructor(x.$high << y | x.$low >>> (32 - y), (x.$low << y) >>> 0);
  }
  if (y < 64) {
    return new x.constructor(x.$low << (y - 32), 0);
  }
  return new x.constructor(0, 0);
};

var $shiftRightInt64 = function(x, y) {
  if (y === 0) {
    return x;
  }
  if (y < 32) {
    return new x.constructor(x.$high >> y, (x.$low >>> y | x.$high << (32 - y)) >>> 0);
  }
  if (y < 64) {
    return new x.constructor(x.$high >> 31, (x.$high >> (y - 32)) >>> 0);
  }
  if (x.$high < 0) {
    return new x.constructor(-1, 4294967295);
  }
  return new x.constructor(0, 0);
};

var $shiftRightUint64 = function(x, y) {
  if (y === 0) {
    return x;
  }
  if (y < 32) {
    return new x.constructor(x.$high >>> y, (x.$low >>> y | x.$high << (32 - y)) >>> 0);
  }
  if (y < 64) {
    return new x.constructor(0, x.$high >>> (y - 32));
  }
  return new x.constructor(0, 0);
};

var $mul64 = function(x, y) {
  var high = 0, low = 0;
  if ((y.$low & 1) !== 0) {
    high = x.$high;
    low = x.$low;
  }
  for (var i = 1; i < 32; i++) {
    if ((y.$low & 1<<i) !== 0) {
      high += x.$high << i | x.$low >>> (32 - i);
      low += (x.$low << i) >>> 0;
    }
  }
  for (var i = 0; i < 32; i++) {
    if ((y.$high & 1<<i) !== 0) {
      high += x.$low << i;
    }
  }
  return new x.constructor(high, low);
};

var $div64 = function(x, y, returnRemainder) {
  if (y.$high === 0 && y.$low === 0) {
    $throwRuntimeError("integer divide by zero");
  }

  var s = 1;
  var rs = 1;

  var xHigh = x.$high;
  var xLow = x.$low;
  if (xHigh < 0) {
    s = -1;
    rs = -1;
    xHigh = -xHigh;
    if (xLow !== 0) {
      xHigh--;
      xLow = 4294967296 - xLow;
    }
  }

  var yHigh = y.$high;
  var yLow = y.$low;
  if (y.$high < 0) {
    s *= -1;
    yHigh = -yHigh;
    if (yLow !== 0) {
      yHigh--;
      yLow = 4294967296 - yLow;
    }
  }

  var high = 0, low = 0, n = 0;
  while (yHigh < 2147483648 && ((xHigh > yHigh) || (xHigh === yHigh && xLow > yLow))) {
    yHigh = (yHigh << 1 | yLow >>> 31) >>> 0;
    yLow = (yLow << 1) >>> 0;
    n++;
  }
  for (var i = 0; i <= n; i++) {
    high = high << 1 | low >>> 31;
    low = (low << 1) >>> 0;
    if ((xHigh > yHigh) || (xHigh === yHigh && xLow >= yLow)) {
      xHigh = xHigh - yHigh;
      xLow = xLow - yLow;
      if (xLow < 0) {
        xHigh--;
        xLow += 4294967296;
      }
      low++;
      if (low === 4294967296) {
        high++;
        low = 0;
      }
    }
    yLow = (yLow >>> 1 | yHigh << (32 - 1)) >>> 0;
    yHigh = yHigh >>> 1;
  }

  if (returnRemainder) {
    return new x.constructor(xHigh * rs, xLow * rs);
  }
  return new x.constructor(high * s, low * s);
};

var $divComplex = function(n, d) {
  var ninf = n.$real === Infinity || n.$real === -Infinity || n.$imag === Infinity || n.$imag === -Infinity;
  var dinf = d.$real === Infinity || d.$real === -Infinity || d.$imag === Infinity || d.$imag === -Infinity;
  var nnan = !ninf && (n.$real !== n.$real || n.$imag !== n.$imag);
  var dnan = !dinf && (d.$real !== d.$real || d.$imag !== d.$imag);
  if(nnan || dnan) {
    return new n.constructor(NaN, NaN);
  }
  if (ninf && !dinf) {
    return new n.constructor(Infinity, Infinity);
  }
  if (!ninf && dinf) {
    return new n.constructor(0, 0);
  }
  if (d.$real === 0 && d.$imag === 0) {
    if (n.$real === 0 && n.$imag === 0) {
      return new n.constructor(NaN, NaN);
    }
    return new n.constructor(Infinity, Infinity);
  }
  var a = Math.abs(d.$real);
  var b = Math.abs(d.$imag);
  if (a <= b) {
    var ratio = d.$real / d.$imag;
    var denom = d.$real * ratio + d.$imag;
    return new n.constructor((n.$real * ratio + n.$imag) / denom, (n.$imag * ratio - n.$real) / denom);
  }
  var ratio = d.$imag / d.$real;
  var denom = d.$imag * ratio + d.$real;
  return new n.constructor((n.$imag * ratio + n.$real) / denom, (n.$imag - n.$real * ratio) / denom);
};

var $kindBool = 1;
var $kindInt = 2;
var $kindInt8 = 3;
var $kindInt16 = 4;
var $kindInt32 = 5;
var $kindInt64 = 6;
var $kindUint = 7;
var $kindUint8 = 8;
var $kindUint16 = 9;
var $kindUint32 = 10;
var $kindUint64 = 11;
var $kindUintptr = 12;
var $kindFloat32 = 13;
var $kindFloat64 = 14;
var $kindComplex64 = 15;
var $kindComplex128 = 16;
var $kindArray = 17;
var $kindChan = 18;
var $kindFunc = 19;
var $kindInterface = 20;
var $kindMap = 21;
var $kindPtr = 22;
var $kindSlice = 23;
var $kindString = 24;
var $kindStruct = 25;
var $kindUnsafePointer = 26;

var $methodSynthesizers = [];
var $addMethodSynthesizer = function(f) {
  if ($methodSynthesizers === null) {
    f();
    return;
  }
  $methodSynthesizers.push(f);
};
var $synthesizeMethods = function() {
  $methodSynthesizers.forEach(function(f) { f(); });
  $methodSynthesizers = null;
};

var $ifaceKeyFor = function(x) {
  if (x === $ifaceNil) {
    return 'nil';
  }
  var c = x.constructor;
  return c.string + '$' + c.keyFor(x.$val);
};

var $identity = function(x) { return x; };

var $typeIDCounter = 0;

var $idKey = function(x) {
  if (x.$id === undefined) {
    $idCounter++;
    x.$id = $idCounter;
  }
  return String(x.$id);
};

var $newType = function(size, kind, string, named, pkg, exported, constructor) {
  var typ;
  switch(kind) {
  case $kindBool:
  case $kindInt:
  case $kindInt8:
  case $kindInt16:
  case $kindInt32:
  case $kindUint:
  case $kindUint8:
  case $kindUint16:
  case $kindUint32:
  case $kindUintptr:
  case $kindUnsafePointer:
    typ = function(v) { this.$val = v; };
    typ.wrapped = true;
    typ.keyFor = $identity;
    break;

  case $kindString:
    typ = function(v) { this.$val = v; };
    typ.wrapped = true;
    typ.keyFor = function(x) { return "$" + x; };
    break;

  case $kindFloat32:
  case $kindFloat64:
    typ = function(v) { this.$val = v; };
    typ.wrapped = true;
    typ.keyFor = function(x) { return $floatKey(x); };
    break;

  case $kindInt64:
    typ = function(high, low) {
      this.$high = (high + Math.floor(Math.ceil(low) / 4294967296)) >> 0;
      this.$low = low >>> 0;
      this.$val = this;
    };
    typ.keyFor = function(x) { return x.$high + "$" + x.$low; };
    break;

  case $kindUint64:
    typ = function(high, low) {
      this.$high = (high + Math.floor(Math.ceil(low) / 4294967296)) >>> 0;
      this.$low = low >>> 0;
      this.$val = this;
    };
    typ.keyFor = function(x) { return x.$high + "$" + x.$low; };
    break;

  case $kindComplex64:
    typ = function(real, imag) {
      this.$real = $fround(real);
      this.$imag = $fround(imag);
      this.$val = this;
    };
    typ.keyFor = function(x) { return x.$real + "$" + x.$imag; };
    break;

  case $kindComplex128:
    typ = function(real, imag) {
      this.$real = real;
      this.$imag = imag;
      this.$val = this;
    };
    typ.keyFor = function(x) { return x.$real + "$" + x.$imag; };
    break;

  case $kindArray:
    typ = function(v) { this.$val = v; };
    typ.wrapped = true;
    typ.ptr = $newType(4, $kindPtr, "*" + string, false, "", false, function(array) {
      this.$get = function() { return array; };
      this.$set = function(v) { typ.copy(this, v); };
      this.$val = array;
    });
    typ.init = function(elem, len) {
      typ.elem = elem;
      typ.len = len;
      typ.comparable = elem.comparable;
      typ.keyFor = function(x) {
        return Array.prototype.join.call($mapArray(x, function(e) {
          return String(elem.keyFor(e)).replace(/\\/g, "\\\\").replace(/\$/g, "\\$");
        }), "$");
      };
      typ.copy = function(dst, src) {
        $copyArray(dst, src, 0, 0, src.length, elem);
      };
      typ.ptr.init(typ);
      Object.defineProperty(typ.ptr.nil, "nilCheck", { get: $throwNilPointerError });
    };
    break;

  case $kindChan:
    typ = function(v) { this.$val = v; };
    typ.wrapped = true;
    typ.keyFor = $idKey;
    typ.init = function(elem, sendOnly, recvOnly) {
      typ.elem = elem;
      typ.sendOnly = sendOnly;
      typ.recvOnly = recvOnly;
    };
    break;

  case $kindFunc:
    typ = function(v) { this.$val = v; };
    typ.wrapped = true;
    typ.init = function(params, results, variadic) {
      typ.params = params;
      typ.results = results;
      typ.variadic = variadic;
      typ.comparable = false;
    };
    break;

  case $kindInterface:
    typ = { implementedBy: {}, missingMethodFor: {} };
    typ.keyFor = $ifaceKeyFor;
    typ.init = function(methods) {
      typ.methods = methods;
      methods.forEach(function(m) {
        $ifaceNil[m.prop] = $throwNilPointerError;
      });
    };
    break;

  case $kindMap:
    typ = function(v) { this.$val = v; };
    typ.wrapped = true;
    typ.init = function(key, elem) {
      typ.key = key;
      typ.elem = elem;
      typ.comparable = false;
    };
    break;

  case $kindPtr:
    typ = constructor || function(getter, setter, target) {
      this.$get = getter;
      this.$set = setter;
      this.$target = target;
      this.$val = this;
    };
    typ.keyFor = $idKey;
    typ.init = function(elem) {
      typ.elem = elem;
      typ.wrapped = (elem.kind === $kindArray);
      typ.nil = new typ($throwNilPointerError, $throwNilPointerError);
    };
    break;

  case $kindSlice:
    typ = function(array) {
      if (array.constructor !== typ.nativeArray) {
        array = new typ.nativeArray(array);
      }
      this.$array = array;
      this.$offset = 0;
      this.$length = array.length;
      this.$capacity = array.length;
      this.$val = this;
    };
    typ.init = function(elem) {
      typ.elem = elem;
      typ.comparable = false;
      typ.nativeArray = $nativeArray(elem.kind);
      typ.nil = new typ([]);
    };
    break;

  case $kindStruct:
    typ = function(v) { this.$val = v; };
    typ.wrapped = true;
    typ.ptr = $newType(4, $kindPtr, "*" + string, false, "", exported, constructor);
    typ.ptr.elem = typ;
    typ.ptr.prototype.$get = function() { return this; };
    typ.ptr.prototype.$set = function(v) { typ.copy(this, v); };
    typ.init = function(pkgPath, fields) {
      typ.pkgPath = pkgPath;
      typ.fields = fields;
      fields.forEach(function(f) {
        if (!f.typ.comparable) {
          typ.comparable = false;
        }
      });
      typ.keyFor = function(x) {
        var val = x.$val;
        return $mapArray(fields, function(f) {
          return String(f.typ.keyFor(val[f.prop])).replace(/\\/g, "\\\\").replace(/\$/g, "\\$");
        }).join("$");
      };
      typ.copy = function(dst, src) {
        for (var i = 0; i < fields.length; i++) {
          var f = fields[i];
          switch (f.typ.kind) {
          case $kindArray:
          case $kindStruct:
            f.typ.copy(dst[f.prop], src[f.prop]);
            continue;
          default:
            dst[f.prop] = src[f.prop];
            continue;
          }
        }
      };
      /* nil value */
      var properties = {};
      fields.forEach(function(f) {
        properties[f.prop] = { get: $throwNilPointerError, set: $throwNilPointerError };
      });
      typ.ptr.nil = Object.create(constructor.prototype, properties);
      typ.ptr.nil.$val = typ.ptr.nil;
      /* methods for embedded fields */
      $addMethodSynthesizer(function() {
        var synthesizeMethod = function(target, m, f) {
          if (target.prototype[m.prop] !== undefined) { return; }
          target.prototype[m.prop] = function() {
            var v = this.$val[f.prop];
            if (f.typ === $jsObjectPtr) {
              v = new $jsObjectPtr(v);
            }
            if (v.$val === undefined) {
              v = new f.typ(v);
            }
            return v[m.prop].apply(v, arguments);
          };
        };
        fields.forEach(function(f) {
          if (f.name === "") {
            $methodSet(f.typ).forEach(function(m) {
              synthesizeMethod(typ, m, f);
              synthesizeMethod(typ.ptr, m, f);
            });
            $methodSet($ptrType(f.typ)).forEach(function(m) {
              synthesizeMethod(typ.ptr, m, f);
            });
          }
        });
      });
    };
    break;

  default:
    $panic(new $String("invalid kind: " + kind));
  }

  switch (kind) {
  case $kindBool:
  case $kindMap:
    typ.zero = function() { return false; };
    break;

  case $kindInt:
  case $kindInt8:
  case $kindInt16:
  case $kindInt32:
  case $kindUint:
  case $kindUint8 :
  case $kindUint16:
  case $kindUint32:
  case $kindUintptr:
  case $kindUnsafePointer:
  case $kindFloat32:
  case $kindFloat64:
    typ.zero = function() { return 0; };
    break;

  case $kindString:
    typ.zero = function() { return ""; };
    break;

  case $kindInt64:
  case $kindUint64:
  case $kindComplex64:
  case $kindComplex128:
    var zero = new typ(0, 0);
    typ.zero = function() { return zero; };
    break;

  case $kindPtr:
  case $kindSlice:
    typ.zero = function() { return typ.nil; };
    break;

  case $kindChan:
    typ.zero = function() { return $chanNil; };
    break;

  case $kindFunc:
    typ.zero = function() { return $throwNilPointerError; };
    break;

  case $kindInterface:
    typ.zero = function() { return $ifaceNil; };
    break;

  case $kindArray:
    typ.zero = function() {
      var arrayClass = $nativeArray(typ.elem.kind);
      if (arrayClass !== Array) {
        return new arrayClass(typ.len);
      }
      var array = new Array(typ.len);
      for (var i = 0; i < typ.len; i++) {
        array[i] = typ.elem.zero();
      }
      return array;
    };
    break;

  case $kindStruct:
    typ.zero = function() { return new typ.ptr(); };
    break;

  default:
    $panic(new $String("invalid kind: " + kind));
  }

  typ.id = $typeIDCounter;
  $typeIDCounter++;
  typ.size = size;
  typ.kind = kind;
  typ.string = string;
  typ.named = named;
  typ.pkg = pkg;
  typ.exported = exported;
  typ.methods = [];
  typ.methodSetCache = null;
  typ.comparable = true;
  return typ;
};

var $methodSet = function(typ) {
  if (typ.methodSetCache !== null) {
    return typ.methodSetCache;
  }
  var base = {};

  var isPtr = (typ.kind === $kindPtr);
  if (isPtr && typ.elem.kind === $kindInterface) {
    typ.methodSetCache = [];
    return [];
  }

  var current = [{typ: isPtr ? typ.elem : typ, indirect: isPtr}];

  var seen = {};

  while (current.length > 0) {
    var next = [];
    var mset = [];

    current.forEach(function(e) {
      if (seen[e.typ.string]) {
        return;
      }
      seen[e.typ.string] = true;

      if (e.typ.named) {
        mset = mset.concat(e.typ.methods);
        if (e.indirect) {
          mset = mset.concat($ptrType(e.typ).methods);
        }
      }

      switch (e.typ.kind) {
      case $kindStruct:
        e.typ.fields.forEach(function(f) {
          if (f.name === "") {
            var fTyp = f.typ;
            var fIsPtr = (fTyp.kind === $kindPtr);
            next.push({typ: fIsPtr ? fTyp.elem : fTyp, indirect: e.indirect || fIsPtr});
          }
        });
        break;

      case $kindInterface:
        mset = mset.concat(e.typ.methods);
        break;
      }
    });

    mset.forEach(function(m) {
      if (base[m.name] === undefined) {
        base[m.name] = m;
      }
    });

    current = next;
  }

  typ.methodSetCache = [];
  Object.keys(base).sort().forEach(function(name) {
    typ.methodSetCache.push(base[name]);
  });
  return typ.methodSetCache;
};

var $Bool          = $newType( 1, $kindBool,          "bool",           true, "", false, null);
var $Int           = $newType( 4, $kindInt,           "int",            true, "", false, null);
var $Int8          = $newType( 1, $kindInt8,          "int8",           true, "", false, null);
var $Int16         = $newType( 2, $kindInt16,         "int16",          true, "", false, null);
var $Int32         = $newType( 4, $kindInt32,         "int32",          true, "", false, null);
var $Int64         = $newType( 8, $kindInt64,         "int64",          true, "", false, null);
var $Uint          = $newType( 4, $kindUint,          "uint",           true, "", false, null);
var $Uint8         = $newType( 1, $kindUint8,         "uint8",          true, "", false, null);
var $Uint16        = $newType( 2, $kindUint16,        "uint16",         true, "", false, null);
var $Uint32        = $newType( 4, $kindUint32,        "uint32",         true, "", false, null);
var $Uint64        = $newType( 8, $kindUint64,        "uint64",         true, "", false, null);
var $Uintptr       = $newType( 4, $kindUintptr,       "uintptr",        true, "", false, null);
var $Float32       = $newType( 4, $kindFloat32,       "float32",        true, "", false, null);
var $Float64       = $newType( 8, $kindFloat64,       "float64",        true, "", false, null);
var $Complex64     = $newType( 8, $kindComplex64,     "complex64",      true, "", false, null);
var $Complex128    = $newType(16, $kindComplex128,    "complex128",     true, "", false, null);
var $String        = $newType( 8, $kindString,        "string",         true, "", false, null);
var $UnsafePointer = $newType( 4, $kindUnsafePointer, "unsafe.Pointer", true, "", false, null);

var $nativeArray = function(elemKind) {
  switch (elemKind) {
  case $kindInt:
    return Int32Array;
  case $kindInt8:
    return Int8Array;
  case $kindInt16:
    return Int16Array;
  case $kindInt32:
    return Int32Array;
  case $kindUint:
    return Uint32Array;
  case $kindUint8:
    return Uint8Array;
  case $kindUint16:
    return Uint16Array;
  case $kindUint32:
    return Uint32Array;
  case $kindUintptr:
    return Uint32Array;
  case $kindFloat32:
    return Float32Array;
  case $kindFloat64:
    return Float64Array;
  default:
    return Array;
  }
};
var $toNativeArray = function(elemKind, array) {
  var nativeArray = $nativeArray(elemKind);
  if (nativeArray === Array) {
    return array;
  }
  return new nativeArray(array);
};
var $arrayTypes = {};
var $arrayType = function(elem, len) {
  var typeKey = elem.id + "$" + len;
  var typ = $arrayTypes[typeKey];
  if (typ === undefined) {
    typ = $newType(12, $kindArray, "[" + len + "]" + elem.string, false, "", false, null);
    $arrayTypes[typeKey] = typ;
    typ.init(elem, len);
  }
  return typ;
};

var $chanType = function(elem, sendOnly, recvOnly) {
  var string = (recvOnly ? "<-" : "") + "chan" + (sendOnly ? "<- " : " ") + elem.string;
  var field = sendOnly ? "SendChan" : (recvOnly ? "RecvChan" : "Chan");
  var typ = elem[field];
  if (typ === undefined) {
    typ = $newType(4, $kindChan, string, false, "", false, null);
    elem[field] = typ;
    typ.init(elem, sendOnly, recvOnly);
  }
  return typ;
};
var $Chan = function(elem, capacity) {
  if (capacity < 0 || capacity > 2147483647) {
    $throwRuntimeError("makechan: size out of range");
  }
  this.$elem = elem;
  this.$capacity = capacity;
  this.$buffer = [];
  this.$sendQueue = [];
  this.$recvQueue = [];
  this.$closed = false;
};
var $chanNil = new $Chan(null, 0);
$chanNil.$sendQueue = $chanNil.$recvQueue = { length: 0, push: function() {}, shift: function() { return undefined; }, indexOf: function() { return -1; } };

var $funcTypes = {};
var $funcType = function(params, results, variadic) {
  var typeKey = $mapArray(params, function(p) { return p.id; }).join(",") + "$" + $mapArray(results, function(r) { return r.id; }).join(",") + "$" + variadic;
  var typ = $funcTypes[typeKey];
  if (typ === undefined) {
    var paramTypes = $mapArray(params, function(p) { return p.string; });
    if (variadic) {
      paramTypes[paramTypes.length - 1] = "..." + paramTypes[paramTypes.length - 1].substr(2);
    }
    var string = "func(" + paramTypes.join(", ") + ")";
    if (results.length === 1) {
      string += " " + results[0].string;
    } else if (results.length > 1) {
      string += " (" + $mapArray(results, function(r) { return r.string; }).join(", ") + ")";
    }
    typ = $newType(4, $kindFunc, string, false, "", false, null);
    $funcTypes[typeKey] = typ;
    typ.init(params, results, variadic);
  }
  return typ;
};

var $interfaceTypes = {};
var $interfaceType = function(methods) {
  var typeKey = $mapArray(methods, function(m) { return m.pkg + "," + m.name + "," + m.typ.id; }).join("$");
  var typ = $interfaceTypes[typeKey];
  if (typ === undefined) {
    var string = "interface {}";
    if (methods.length !== 0) {
      string = "interface { " + $mapArray(methods, function(m) {
        return (m.pkg !== "" ? m.pkg + "." : "") + m.name + m.typ.string.substr(4);
      }).join("; ") + " }";
    }
    typ = $newType(8, $kindInterface, string, false, "", false, null);
    $interfaceTypes[typeKey] = typ;
    typ.init(methods);
  }
  return typ;
};
var $emptyInterface = $interfaceType([]);
var $ifaceNil = {};
var $error = $newType(8, $kindInterface, "error", true, "", false, null);
$error.init([{prop: "Error", name: "Error", pkg: "", typ: $funcType([], [$String], false)}]);

var $mapTypes = {};
var $mapType = function(key, elem) {
  var typeKey = key.id + "$" + elem.id;
  var typ = $mapTypes[typeKey];
  if (typ === undefined) {
    typ = $newType(4, $kindMap, "map[" + key.string + "]" + elem.string, false, "", false, null);
    $mapTypes[typeKey] = typ;
    typ.init(key, elem);
  }
  return typ;
};
var $makeMap = function(keyForFunc, entries) {
  var m = {};
  for (var i = 0; i < entries.length; i++) {
    var e = entries[i];
    m[keyForFunc(e.k)] = e;
  }
  return m;
};

var $ptrType = function(elem) {
  var typ = elem.ptr;
  if (typ === undefined) {
    typ = $newType(4, $kindPtr, "*" + elem.string, false, "", elem.exported, null);
    elem.ptr = typ;
    typ.init(elem);
  }
  return typ;
};

var $newDataPointer = function(data, constructor) {
  if (constructor.elem.kind === $kindStruct) {
    return data;
  }
  return new constructor(function() { return data; }, function(v) { data = v; });
};

var $indexPtr = function(array, index, constructor) {
  array.$ptr = array.$ptr || {};
  return array.$ptr[index] || (array.$ptr[index] = new constructor(function() { return array[index]; }, function(v) { array[index] = v; }));
};

var $sliceType = function(elem) {
  var typ = elem.slice;
  if (typ === undefined) {
    typ = $newType(12, $kindSlice, "[]" + elem.string, false, "", false, null);
    elem.slice = typ;
    typ.init(elem);
  }
  return typ;
};
var $makeSlice = function(typ, length, capacity) {
  capacity = capacity || length;
  if (length < 0 || length > 2147483647) {
    $throwRuntimeError("makeslice: len out of range");
  }
  if (capacity < 0 || capacity < length || capacity > 2147483647) {
    $throwRuntimeError("makeslice: cap out of range");
  }
  var array = new typ.nativeArray(capacity);
  if (typ.nativeArray === Array) {
    for (var i = 0; i < capacity; i++) {
      array[i] = typ.elem.zero();
    }
  }
  var slice = new typ(array);
  slice.$length = length;
  return slice;
};

var $structTypes = {};
var $structType = function(pkgPath, fields) {
  var typeKey = $mapArray(fields, function(f) { return f.name + "," + f.typ.id + "," + f.tag; }).join("$");
  var typ = $structTypes[typeKey];
  if (typ === undefined) {
    var string = "struct { " + $mapArray(fields, function(f) {
      return f.name + " " + f.typ.string + (f.tag !== "" ? (" \"" + f.tag.replace(/\\/g, "\\\\").replace(/"/g, "\\\"") + "\"") : "");
    }).join("; ") + " }";
    if (fields.length === 0) {
      string = "struct {}";
    }
    typ = $newType(0, $kindStruct, string, false, "", false, function() {
      this.$val = this;
      for (var i = 0; i < fields.length; i++) {
        var f = fields[i];
        var arg = arguments[i];
        this[f.prop] = arg !== undefined ? arg : f.typ.zero();
      }
    });
    $structTypes[typeKey] = typ;
    typ.init(pkgPath, fields);
  }
  return typ;
};

var $assertType = function(value, type, returnTuple) {
  var isInterface = (type.kind === $kindInterface), ok, missingMethod = "";
  if (value === $ifaceNil) {
    ok = false;
  } else if (!isInterface) {
    ok = value.constructor === type;
  } else {
    var valueTypeString = value.constructor.string;
    ok = type.implementedBy[valueTypeString];
    if (ok === undefined) {
      ok = true;
      var valueMethodSet = $methodSet(value.constructor);
      var interfaceMethods = type.methods;
      for (var i = 0; i < interfaceMethods.length; i++) {
        var tm = interfaceMethods[i];
        var found = false;
        for (var j = 0; j < valueMethodSet.length; j++) {
          var vm = valueMethodSet[j];
          if (vm.name === tm.name && vm.pkg === tm.pkg && vm.typ === tm.typ) {
            found = true;
            break;
          }
        }
        if (!found) {
          ok = false;
          type.missingMethodFor[valueTypeString] = tm.name;
          break;
        }
      }
      type.implementedBy[valueTypeString] = ok;
    }
    if (!ok) {
      missingMethod = type.missingMethodFor[valueTypeString];
    }
  }

  if (!ok) {
    if (returnTuple) {
      return [type.zero(), false];
    }
    $panic(new $packages["runtime"].TypeAssertionError.ptr("", (value === $ifaceNil ? "" : value.constructor.string), type.string, missingMethod));
  }

  if (!isInterface) {
    value = value.$val;
  }
  if (type === $jsObjectPtr) {
    value = value.object;
  }
  return returnTuple ? [value, true] : value;
};

var $stackDepthOffset = 0;
var $getStackDepth = function() {
  var err = new Error();
  if (err.stack === undefined) {
    return undefined;
  }
  return $stackDepthOffset + err.stack.split("\n").length;
};

var $panicStackDepth = null, $panicValue;
var $callDeferred = function(deferred, jsErr, fromPanic) {
  if (!fromPanic && deferred !== null && deferred.index >= $curGoroutine.deferStack.length) {
    throw jsErr;
  }
  if (jsErr !== null) {
    var newErr = null;
    try {
      $curGoroutine.deferStack.push(deferred);
      $panic(new $jsErrorPtr(jsErr));
    } catch (err) {
      newErr = err;
    }
    $curGoroutine.deferStack.pop();
    $callDeferred(deferred, newErr);
    return;
  }
  if ($curGoroutine.asleep) {
    return;
  }

  $stackDepthOffset--;
  var outerPanicStackDepth = $panicStackDepth;
  var outerPanicValue = $panicValue;

  var localPanicValue = $curGoroutine.panicStack.pop();
  if (localPanicValue !== undefined) {
    $panicStackDepth = $getStackDepth();
    $panicValue = localPanicValue;
  }

  try {
    while (true) {
      if (deferred === null) {
        deferred = $curGoroutine.deferStack[$curGoroutine.deferStack.length - 1];
        if (deferred === undefined) {
          /* The panic reached the top of the stack. Clear it and throw it as a JavaScript error. */
          $panicStackDepth = null;
          if (localPanicValue.Object instanceof Error) {
            throw localPanicValue.Object;
          }
          var msg;
          if (localPanicValue.constructor === $String) {
            msg = localPanicValue.$val;
          } else if (localPanicValue.Error !== undefined) {
            msg = localPanicValue.Error();
          } else if (localPanicValue.String !== undefined) {
            msg = localPanicValue.String();
          } else {
            msg = localPanicValue;
          }
          throw new Error(msg);
        }
      }
      var call = deferred.pop();
      if (call === undefined) {
        $curGoroutine.deferStack.pop();
        if (localPanicValue !== undefined) {
          deferred = null;
          continue;
        }
        return;
      }
      var r = call[0].apply(call[2], call[1]);
      if (r && r.$blk !== undefined) {
        deferred.push([r.$blk, [], r]);
        if (fromPanic) {
          throw null;
        }
        return;
      }

      if (localPanicValue !== undefined && $panicStackDepth === null) {
        throw null; /* error was recovered */
      }
    }
  } finally {
    if (localPanicValue !== undefined) {
      if ($panicStackDepth !== null) {
        $curGoroutine.panicStack.push(localPanicValue);
      }
      $panicStackDepth = outerPanicStackDepth;
      $panicValue = outerPanicValue;
    }
    $stackDepthOffset++;
  }
};

var $panic = function(value) {
  $curGoroutine.panicStack.push(value);
  $callDeferred(null, null, true);
};
var $recover = function() {
  if ($panicStackDepth === null || ($panicStackDepth !== undefined && $panicStackDepth !== $getStackDepth() - 2)) {
    return $ifaceNil;
  }
  $panicStackDepth = null;
  return $panicValue;
};
var $throw = function(err) { throw err; };

var $noGoroutine = { asleep: false, exit: false, deferStack: [], panicStack: [] };
var $curGoroutine = $noGoroutine, $totalGoroutines = 0, $awakeGoroutines = 0, $checkForDeadlock = true;
var $mainFinished = false;
var $go = function(fun, args, direct) {
  $totalGoroutines++;
  $awakeGoroutines++;
  var $goroutine = function() {
    try {
      $curGoroutine = $goroutine;
      var r = fun.apply(undefined, args);
      if (r && r.$blk !== undefined) {
        fun = function() { return r.$blk(); };
        args = [];
        return;
      }
      $goroutine.exit = true;
    } catch (err) {
      if (!$goroutine.exit) {
        throw err;
      }
    } finally {
      $curGoroutine = $noGoroutine;
      if ($goroutine.exit) { /* also set by runtime.Goexit() */
        $totalGoroutines--;
        $goroutine.asleep = true;
      }
      if ($goroutine.asleep) {
        $awakeGoroutines--;
        if (!$mainFinished && $awakeGoroutines === 0 && $checkForDeadlock) {
          console.error("fatal error: all goroutines are asleep - deadlock!");
          if ($global.process !== undefined) {
            $global.process.exit(2);
          }
        }
      }
    }
  };
  $goroutine.asleep = false;
  $goroutine.exit = false;
  $goroutine.deferStack = [];
  $goroutine.panicStack = [];
  $schedule($goroutine);
};

var $scheduled = [];
var $runScheduled = function() {
  try {
    var r;
    while ((r = $scheduled.shift()) !== undefined) {
      r();
    }
  } finally {
    if ($scheduled.length > 0) {
      setTimeout($runScheduled, 0);
    }
  }
};

var $schedule = function(goroutine) {
  if (goroutine.asleep) {
    goroutine.asleep = false;
    $awakeGoroutines++;
  }
  $scheduled.push(goroutine);
  if ($curGoroutine === $noGoroutine) {
    $runScheduled();
  }
};

var $setTimeout = function(f, t) {
  $awakeGoroutines++;
  return setTimeout(function() {
    $awakeGoroutines--;
    f();
  }, t);
};

var $block = function() {
  if ($curGoroutine === $noGoroutine) {
    $throwRuntimeError("cannot block in JavaScript callback, fix by wrapping code in goroutine");
  }
  $curGoroutine.asleep = true;
};

var $send = function(chan, value) {
  if (chan.$closed) {
    $throwRuntimeError("send on closed channel");
  }
  var queuedRecv = chan.$recvQueue.shift();
  if (queuedRecv !== undefined) {
    queuedRecv([value, true]);
    return;
  }
  if (chan.$buffer.length < chan.$capacity) {
    chan.$buffer.push(value);
    return;
  }

  var thisGoroutine = $curGoroutine;
  var closedDuringSend;
  chan.$sendQueue.push(function(closed) {
    closedDuringSend = closed;
    $schedule(thisGoroutine);
    return value;
  });
  $block();
  return {
    $blk: function() {
      if (closedDuringSend) {
        $throwRuntimeError("send on closed channel");
      }
    }
  };
};
var $recv = function(chan) {
  var queuedSend = chan.$sendQueue.shift();
  if (queuedSend !== undefined) {
    chan.$buffer.push(queuedSend(false));
  }
  var bufferedValue = chan.$buffer.shift();
  if (bufferedValue !== undefined) {
    return [bufferedValue, true];
  }
  if (chan.$closed) {
    return [chan.$elem.zero(), false];
  }

  var thisGoroutine = $curGoroutine;
  var f = { $blk: function() { return this.value; } };
  var queueEntry = function(v) {
    f.value = v;
    $schedule(thisGoroutine);
  };
  chan.$recvQueue.push(queueEntry);
  $block();
  return f;
};
var $close = function(chan) {
  if (chan.$closed) {
    $throwRuntimeError("close of closed channel");
  }
  chan.$closed = true;
  while (true) {
    var queuedSend = chan.$sendQueue.shift();
    if (queuedSend === undefined) {
      break;
    }
    queuedSend(true); /* will panic */
  }
  while (true) {
    var queuedRecv = chan.$recvQueue.shift();
    if (queuedRecv === undefined) {
      break;
    }
    queuedRecv([chan.$elem.zero(), false]);
  }
};
var $select = function(comms) {
  var ready = [];
  var selection = -1;
  for (var i = 0; i < comms.length; i++) {
    var comm = comms[i];
    var chan = comm[0];
    switch (comm.length) {
    case 0: /* default */
      selection = i;
      break;
    case 1: /* recv */
      if (chan.$sendQueue.length !== 0 || chan.$buffer.length !== 0 || chan.$closed) {
        ready.push(i);
      }
      break;
    case 2: /* send */
      if (chan.$closed) {
        $throwRuntimeError("send on closed channel");
      }
      if (chan.$recvQueue.length !== 0 || chan.$buffer.length < chan.$capacity) {
        ready.push(i);
      }
      break;
    }
  }

  if (ready.length !== 0) {
    selection = ready[Math.floor(Math.random() * ready.length)];
  }
  if (selection !== -1) {
    var comm = comms[selection];
    switch (comm.length) {
    case 0: /* default */
      return [selection];
    case 1: /* recv */
      return [selection, $recv(comm[0])];
    case 2: /* send */
      $send(comm[0], comm[1]);
      return [selection];
    }
  }

  var entries = [];
  var thisGoroutine = $curGoroutine;
  var f = { $blk: function() { return this.selection; } };
  var removeFromQueues = function() {
    for (var i = 0; i < entries.length; i++) {
      var entry = entries[i];
      var queue = entry[0];
      var index = queue.indexOf(entry[1]);
      if (index !== -1) {
        queue.splice(index, 1);
      }
    }
  };
  for (var i = 0; i < comms.length; i++) {
    (function(i) {
      var comm = comms[i];
      switch (comm.length) {
      case 1: /* recv */
        var queueEntry = function(value) {
          f.selection = [i, value];
          removeFromQueues();
          $schedule(thisGoroutine);
        };
        entries.push([comm[0].$recvQueue, queueEntry]);
        comm[0].$recvQueue.push(queueEntry);
        break;
      case 2: /* send */
        var queueEntry = function() {
          if (comm[0].$closed) {
            $throwRuntimeError("send on closed channel");
          }
          f.selection = [i];
          removeFromQueues();
          $schedule(thisGoroutine);
          return comm[1];
        };
        entries.push([comm[0].$sendQueue, queueEntry]);
        comm[0].$sendQueue.push(queueEntry);
        break;
      }
    })(i);
  }
  $block();
  return f;
};

var $jsObjectPtr, $jsErrorPtr;

var $needsExternalization = function(t) {
  switch (t.kind) {
    case $kindBool:
    case $kindInt:
    case $kindInt8:
    case $kindInt16:
    case $kindInt32:
    case $kindUint:
    case $kindUint8:
    case $kindUint16:
    case $kindUint32:
    case $kindUintptr:
    case $kindFloat32:
    case $kindFloat64:
      return false;
    default:
      return t !== $jsObjectPtr;
  }
};

var $externalize = function(v, t) {
  if (t === $jsObjectPtr) {
    return v;
  }
  switch (t.kind) {
  case $kindBool:
  case $kindInt:
  case $kindInt8:
  case $kindInt16:
  case $kindInt32:
  case $kindUint:
  case $kindUint8:
  case $kindUint16:
  case $kindUint32:
  case $kindUintptr:
  case $kindFloat32:
  case $kindFloat64:
    return v;
  case $kindInt64:
  case $kindUint64:
    return $flatten64(v);
  case $kindArray:
    if ($needsExternalization(t.elem)) {
      return $mapArray(v, function(e) { return $externalize(e, t.elem); });
    }
    return v;
  case $kindFunc:
    return $externalizeFunction(v, t, false);
  case $kindInterface:
    if (v === $ifaceNil) {
      return null;
    }
    if (v.constructor === $jsObjectPtr) {
      return v.$val.object;
    }
    return $externalize(v.$val, v.constructor);
  case $kindMap:
    var m = {};
    var keys = $keys(v);
    for (var i = 0; i < keys.length; i++) {
      var entry = v[keys[i]];
      m[$externalize(entry.k, t.key)] = $externalize(entry.v, t.elem);
    }
    return m;
  case $kindPtr:
    if (v === t.nil) {
      return null;
    }
    return $externalize(v.$get(), t.elem);
  case $kindSlice:
    if ($needsExternalization(t.elem)) {
      return $mapArray($sliceToArray(v), function(e) { return $externalize(e, t.elem); });
    }
    return $sliceToArray(v);
  case $kindString:
    if ($isASCII(v)) {
      return v;
    }
    var s = "", r;
    for (var i = 0; i < v.length; i += r[1]) {
      r = $decodeRune(v, i);
      var c = r[0];
      if (c > 0xFFFF) {
        var h = Math.floor((c - 0x10000) / 0x400) + 0xD800;
        var l = (c - 0x10000) % 0x400 + 0xDC00;
        s += String.fromCharCode(h, l);
        continue;
      }
      s += String.fromCharCode(c);
    }
    return s;
  case $kindStruct:
    var timePkg = $packages["time"];
    if (timePkg !== undefined && v.constructor === timePkg.Time.ptr) {
      var milli = $div64(v.UnixNano(), new $Int64(0, 1000000));
      return new Date($flatten64(milli));
    }

    var noJsObject = {};
    var searchJsObject = function(v, t) {
      if (t === $jsObjectPtr) {
        return v;
      }
      switch (t.kind) {
      case $kindPtr:
        if (v === t.nil) {
          return noJsObject;
        }
        return searchJsObject(v.$get(), t.elem);
      case $kindStruct:
        var f = t.fields[0];
        return searchJsObject(v[f.prop], f.typ);
      case $kindInterface:
        return searchJsObject(v.$val, v.constructor);
      default:
        return noJsObject;
      }
    };
    var o = searchJsObject(v, t);
    if (o !== noJsObject) {
      return o;
    }

    o = {};
    for (var i = 0; i < t.fields.length; i++) {
      var f = t.fields[i];
      if (!f.exported) {
        continue;
      }
      o[f.name] = $externalize(v[f.prop], f.typ);
    }
    return o;
  }
  $throwRuntimeError("cannot externalize " + t.string);
};

var $externalizeFunction = function(v, t, passThis) {
  if (v === $throwNilPointerError) {
    return null;
  }
  if (v.$externalizeWrapper === undefined) {
    $checkForDeadlock = false;
    v.$externalizeWrapper = function() {
      var args = [];
      for (var i = 0; i < t.params.length; i++) {
        if (t.variadic && i === t.params.length - 1) {
          var vt = t.params[i].elem, varargs = [];
          for (var j = i; j < arguments.length; j++) {
            varargs.push($internalize(arguments[j], vt));
          }
          args.push(new (t.params[i])(varargs));
          break;
        }
        args.push($internalize(arguments[i], t.params[i]));
      }
      var canBlock = $curGoroutine.canBlock;
      $curGoroutine.canBlock = false;
      try {
        var result = v.apply(passThis ? this : undefined, args);
      } finally {
        $curGoroutine.canBlock = canBlock;
      }
      switch (t.results.length) {
      case 0:
        return;
      case 1:
        return $externalize(result, t.results[0]);
      default:
        for (var i = 0; i < t.results.length; i++) {
          result[i] = $externalize(result[i], t.results[i]);
        }
        return result;
      }
    };
  }
  return v.$externalizeWrapper;
};

var $internalize = function(v, t, recv) {
  if (t === $jsObjectPtr) {
    return v;
  }
  if (t === $jsObjectPtr.elem) {
    $throwRuntimeError("cannot internalize js.Object, use *js.Object instead");
  }
  if (v && v.__internal_object__ !== undefined) {
    return $assertType(v.__internal_object__, t, false);
  }
  var timePkg = $packages["time"];
  if (timePkg !== undefined && t === timePkg.Time) {
    if (!(v !== null && v !== undefined && v.constructor === Date)) {
      $throwRuntimeError("cannot internalize time.Time from " + typeof v + ", must be Date");
    }
    return timePkg.Unix(new $Int64(0, 0), new $Int64(0, v.getTime() * 1000000));
  }
  switch (t.kind) {
  case $kindBool:
    return !!v;
  case $kindInt:
    return parseInt(v);
  case $kindInt8:
    return parseInt(v) << 24 >> 24;
  case $kindInt16:
    return parseInt(v) << 16 >> 16;
  case $kindInt32:
    return parseInt(v) >> 0;
  case $kindUint:
    return parseInt(v);
  case $kindUint8:
    return parseInt(v) << 24 >>> 24;
  case $kindUint16:
    return parseInt(v) << 16 >>> 16;
  case $kindUint32:
  case $kindUintptr:
    return parseInt(v) >>> 0;
  case $kindInt64:
  case $kindUint64:
    return new t(0, v);
  case $kindFloat32:
  case $kindFloat64:
    return parseFloat(v);
  case $kindArray:
    if (v.length !== t.len) {
      $throwRuntimeError("got array with wrong size from JavaScript native");
    }
    return $mapArray(v, function(e) { return $internalize(e, t.elem); });
  case $kindFunc:
    return function() {
      var args = [];
      for (var i = 0; i < t.params.length; i++) {
        if (t.variadic && i === t.params.length - 1) {
          var vt = t.params[i].elem, varargs = arguments[i];
          for (var j = 0; j < varargs.$length; j++) {
            args.push($externalize(varargs.$array[varargs.$offset + j], vt));
          }
          break;
        }
        args.push($externalize(arguments[i], t.params[i]));
      }
      var result = v.apply(recv, args);
      switch (t.results.length) {
      case 0:
        return;
      case 1:
        return $internalize(result, t.results[0]);
      default:
        for (var i = 0; i < t.results.length; i++) {
          result[i] = $internalize(result[i], t.results[i]);
        }
        return result;
      }
    };
  case $kindInterface:
    if (t.methods.length !== 0) {
      $throwRuntimeError("cannot internalize " + t.string);
    }
    if (v === null) {
      return $ifaceNil;
    }
    if (v === undefined) {
      return new $jsObjectPtr(undefined);
    }
    switch (v.constructor) {
    case Int8Array:
      return new ($sliceType($Int8))(v);
    case Int16Array:
      return new ($sliceType($Int16))(v);
    case Int32Array:
      return new ($sliceType($Int))(v);
    case Uint8Array:
      return new ($sliceType($Uint8))(v);
    case Uint16Array:
      return new ($sliceType($Uint16))(v);
    case Uint32Array:
      return new ($sliceType($Uint))(v);
    case Float32Array:
      return new ($sliceType($Float32))(v);
    case Float64Array:
      return new ($sliceType($Float64))(v);
    case Array:
      return $internalize(v, $sliceType($emptyInterface));
    case Boolean:
      return new $Bool(!!v);
    case Date:
      if (timePkg === undefined) {
        /* time package is not present, internalize as &js.Object{Date} so it can be externalized into original Date. */
        return new $jsObjectPtr(v);
      }
      return new timePkg.Time($internalize(v, timePkg.Time));
    case Function:
      var funcType = $funcType([$sliceType($emptyInterface)], [$jsObjectPtr], true);
      return new funcType($internalize(v, funcType));
    case Number:
      return new $Float64(parseFloat(v));
    case String:
      return new $String($internalize(v, $String));
    default:
      if ($global.Node && v instanceof $global.Node) {
        return new $jsObjectPtr(v);
      }
      var mapType = $mapType($String, $emptyInterface);
      return new mapType($internalize(v, mapType));
    }
  case $kindMap:
    var m = {};
    var keys = $keys(v);
    for (var i = 0; i < keys.length; i++) {
      var k = $internalize(keys[i], t.key);
      m[t.key.keyFor(k)] = { k: k, v: $internalize(v[keys[i]], t.elem) };
    }
    return m;
  case $kindPtr:
    if (t.elem.kind === $kindStruct) {
      return $internalize(v, t.elem);
    }
  case $kindSlice:
    return new t($mapArray(v, function(e) { return $internalize(e, t.elem); }));
  case $kindString:
    v = String(v);
    if ($isASCII(v)) {
      return v;
    }
    var s = "";
    var i = 0;
    while (i < v.length) {
      var h = v.charCodeAt(i);
      if (0xD800 <= h && h <= 0xDBFF) {
        var l = v.charCodeAt(i + 1);
        var c = (h - 0xD800) * 0x400 + l - 0xDC00 + 0x10000;
        s += $encodeRune(c);
        i += 2;
        continue;
      }
      s += $encodeRune(h);
      i++;
    }
    return s;
  case $kindStruct:
    var noJsObject = {};
    var searchJsObject = function(t) {
      if (t === $jsObjectPtr) {
        return v;
      }
      if (t === $jsObjectPtr.elem) {
        $throwRuntimeError("cannot internalize js.Object, use *js.Object instead");
      }
      switch (t.kind) {
      case $kindPtr:
        return searchJsObject(t.elem);
      case $kindStruct:
        var f = t.fields[0];
        var o = searchJsObject(f.typ);
        if (o !== noJsObject) {
          var n = new t.ptr();
          n[f.prop] = o;
          return n;
        }
        return noJsObject;
      default:
        return noJsObject;
      }
    };
    var o = searchJsObject(t);
    if (o !== noJsObject) {
      return o;
    }
  }
  $throwRuntimeError("cannot internalize " + t.string);
};

/* $isASCII reports whether string s contains only ASCII characters. */
var $isASCII = function(s) {
  for (var i = 0; i < s.length; i++) {
    if (s.charCodeAt(i) >= 128) {
      return false;
    }
  }
  return true;
};

$packages["github.com/gopherjs/gopherjs/js"] = (function() {
	var $pkg = {}, $init, Object, Error, sliceType, sliceType$1, ptrType, sliceType$2, funcType, ptrType$1, MakeFunc, Keys, MakeWrapper, init;
	Object = $pkg.Object = $newType(0, $kindStruct, "js.Object", true, "github.com/gopherjs/gopherjs/js", true, function(object_) {
		this.$val = this;
		if (arguments.length === 0) {
			this.object = null;
			return;
		}
		this.object = object_;
	});
	Error = $pkg.Error = $newType(0, $kindStruct, "js.Error", true, "github.com/gopherjs/gopherjs/js", true, function(Object_) {
		this.$val = this;
		if (arguments.length === 0) {
			this.Object = null;
			return;
		}
		this.Object = Object_;
	});
	sliceType = $sliceType($emptyInterface);
	sliceType$1 = $sliceType($String);
	ptrType = $ptrType(Object);
	sliceType$2 = $sliceType(ptrType);
	funcType = $funcType([sliceType$2], [ptrType], true);
	ptrType$1 = $ptrType(Error);
	Object.ptr.prototype.Get = function(key) {
		var $ptr, key, o;
		o = this;
		return o.object[$externalize(key, $String)];
	};
	Object.prototype.Get = function(key) { return this.$val.Get(key); };
	Object.ptr.prototype.Set = function(key, value) {
		var $ptr, key, o, value;
		o = this;
		o.object[$externalize(key, $String)] = $externalize(value, $emptyInterface);
	};
	Object.prototype.Set = function(key, value) { return this.$val.Set(key, value); };
	Object.ptr.prototype.Delete = function(key) {
		var $ptr, key, o;
		o = this;
		delete o.object[$externalize(key, $String)];
	};
	Object.prototype.Delete = function(key) { return this.$val.Delete(key); };
	Object.ptr.prototype.Length = function() {
		var $ptr, o;
		o = this;
		return $parseInt(o.object.length);
	};
	Object.prototype.Length = function() { return this.$val.Length(); };
	Object.ptr.prototype.Index = function(i) {
		var $ptr, i, o;
		o = this;
		return o.object[i];
	};
	Object.prototype.Index = function(i) { return this.$val.Index(i); };
	Object.ptr.prototype.SetIndex = function(i, value) {
		var $ptr, i, o, value;
		o = this;
		o.object[i] = $externalize(value, $emptyInterface);
	};
	Object.prototype.SetIndex = function(i, value) { return this.$val.SetIndex(i, value); };
	Object.ptr.prototype.Call = function(name, args) {
		var $ptr, args, name, o, obj;
		o = this;
		return (obj = o.object, obj[$externalize(name, $String)].apply(obj, $externalize(args, sliceType)));
	};
	Object.prototype.Call = function(name, args) { return this.$val.Call(name, args); };
	Object.ptr.prototype.Invoke = function(args) {
		var $ptr, args, o;
		o = this;
		return o.object.apply(undefined, $externalize(args, sliceType));
	};
	Object.prototype.Invoke = function(args) { return this.$val.Invoke(args); };
	Object.ptr.prototype.New = function(args) {
		var $ptr, args, o;
		o = this;
		return new ($global.Function.prototype.bind.apply(o.object, [undefined].concat($externalize(args, sliceType))));
	};
	Object.prototype.New = function(args) { return this.$val.New(args); };
	Object.ptr.prototype.Bool = function() {
		var $ptr, o;
		o = this;
		return !!(o.object);
	};
	Object.prototype.Bool = function() { return this.$val.Bool(); };
	Object.ptr.prototype.String = function() {
		var $ptr, o;
		o = this;
		return $internalize(o.object, $String);
	};
	Object.prototype.String = function() { return this.$val.String(); };
	Object.ptr.prototype.Int = function() {
		var $ptr, o;
		o = this;
		return $parseInt(o.object) >> 0;
	};
	Object.prototype.Int = function() { return this.$val.Int(); };
	Object.ptr.prototype.Int64 = function() {
		var $ptr, o;
		o = this;
		return $internalize(o.object, $Int64);
	};
	Object.prototype.Int64 = function() { return this.$val.Int64(); };
	Object.ptr.prototype.Uint64 = function() {
		var $ptr, o;
		o = this;
		return $internalize(o.object, $Uint64);
	};
	Object.prototype.Uint64 = function() { return this.$val.Uint64(); };
	Object.ptr.prototype.Float = function() {
		var $ptr, o;
		o = this;
		return $parseFloat(o.object);
	};
	Object.prototype.Float = function() { return this.$val.Float(); };
	Object.ptr.prototype.Interface = function() {
		var $ptr, o;
		o = this;
		return $internalize(o.object, $emptyInterface);
	};
	Object.prototype.Interface = function() { return this.$val.Interface(); };
	Object.ptr.prototype.Unsafe = function() {
		var $ptr, o;
		o = this;
		return o.object;
	};
	Object.prototype.Unsafe = function() { return this.$val.Unsafe(); };
	Error.ptr.prototype.Error = function() {
		var $ptr, err;
		err = this;
		return "JavaScript error: " + $internalize(err.Object.message, $String);
	};
	Error.prototype.Error = function() { return this.$val.Error(); };
	Error.ptr.prototype.Stack = function() {
		var $ptr, err;
		err = this;
		return $internalize(err.Object.stack, $String);
	};
	Error.prototype.Stack = function() { return this.$val.Stack(); };
	MakeFunc = function(fn) {
		var $ptr, fn;
		return $makeFunc(fn);
	};
	$pkg.MakeFunc = MakeFunc;
	Keys = function(o) {
		var $ptr, a, i, o, s;
		if (o === null || o === undefined) {
			return sliceType$1.nil;
		}
		a = $global.Object.keys(o);
		s = $makeSlice(sliceType$1, $parseInt(a.length));
		i = 0;
		while (true) {
			if (!(i < $parseInt(a.length))) { break; }
			((i < 0 || i >= s.$length) ? ($throwRuntimeError("index out of range"), undefined) : s.$array[s.$offset + i] = $internalize(a[i], $String));
			i = i + (1) >> 0;
		}
		return s;
	};
	$pkg.Keys = Keys;
	MakeWrapper = function(i) {
		var $ptr, i, i$1, m, methods, o, v;
		v = i;
		o = new ($global.Object)();
		o.__internal_object__ = v;
		methods = v.constructor.methods;
		i$1 = 0;
		while (true) {
			if (!(i$1 < $parseInt(methods.length))) { break; }
			m = [m];
			m[0] = methods[i$1];
			if (!($internalize(m[0].pkg, $String) === "")) {
				i$1 = i$1 + (1) >> 0;
				continue;
			}
			o[$externalize($internalize(m[0].name, $String), $String)] = $externalize((function(m) { return function(args) {
				var $ptr, args;
				return $externalizeFunction(v[$externalize($internalize(m[0].prop, $String), $String)], m[0].typ, $externalize(true, $Bool)).apply(v, $externalize(args, sliceType$2));
			}; })(m), funcType);
			i$1 = i$1 + (1) >> 0;
		}
		return o;
	};
	$pkg.MakeWrapper = MakeWrapper;
	init = function() {
		var $ptr, e;
		e = new Error.ptr(null);
		$unused(e);
	};
	ptrType.methods = [{prop: "Get", name: "Get", pkg: "", typ: $funcType([$String], [ptrType], false)}, {prop: "Set", name: "Set", pkg: "", typ: $funcType([$String, $emptyInterface], [], false)}, {prop: "Delete", name: "Delete", pkg: "", typ: $funcType([$String], [], false)}, {prop: "Length", name: "Length", pkg: "", typ: $funcType([], [$Int], false)}, {prop: "Index", name: "Index", pkg: "", typ: $funcType([$Int], [ptrType], false)}, {prop: "SetIndex", name: "SetIndex", pkg: "", typ: $funcType([$Int, $emptyInterface], [], false)}, {prop: "Call", name: "Call", pkg: "", typ: $funcType([$String, sliceType], [ptrType], true)}, {prop: "Invoke", name: "Invoke", pkg: "", typ: $funcType([sliceType], [ptrType], true)}, {prop: "New", name: "New", pkg: "", typ: $funcType([sliceType], [ptrType], true)}, {prop: "Bool", name: "Bool", pkg: "", typ: $funcType([], [$Bool], false)}, {prop: "String", name: "String", pkg: "", typ: $funcType([], [$String], false)}, {prop: "Int", name: "Int", pkg: "", typ: $funcType([], [$Int], false)}, {prop: "Int64", name: "Int64", pkg: "", typ: $funcType([], [$Int64], false)}, {prop: "Uint64", name: "Uint64", pkg: "", typ: $funcType([], [$Uint64], false)}, {prop: "Float", name: "Float", pkg: "", typ: $funcType([], [$Float64], false)}, {prop: "Interface", name: "Interface", pkg: "", typ: $funcType([], [$emptyInterface], false)}, {prop: "Unsafe", name: "Unsafe", pkg: "", typ: $funcType([], [$Uintptr], false)}];
	ptrType$1.methods = [{prop: "Error", name: "Error", pkg: "", typ: $funcType([], [$String], false)}, {prop: "Stack", name: "Stack", pkg: "", typ: $funcType([], [$String], false)}];
	Object.init("github.com/gopherjs/gopherjs/js", [{prop: "object", name: "object", exported: false, typ: ptrType, tag: ""}]);
	Error.init("", [{prop: "Object", name: "", exported: true, typ: ptrType, tag: ""}]);
	$init = function() {
		$pkg.$init = function() {};
		/* */ var $f, $c = false, $s = 0, $r; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		init();
		/* */ } return; } if ($f === undefined) { $f = { $blk: $init }; } $f.$s = $s; $f.$r = $r; return $f;
	};
	$pkg.$init = $init;
	return $pkg;
})();
$packages["runtime/internal/sys"] = (function() {
	var $pkg = {}, $init;
	$init = function() {
		$pkg.$init = function() {};
		/* */ var $f, $c = false, $s = 0, $r; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		/* */ } return; } if ($f === undefined) { $f = { $blk: $init }; } $f.$s = $s; $f.$r = $r; return $f;
	};
	$pkg.$init = $init;
	return $pkg;
})();
$packages["runtime"] = (function() {
	var $pkg = {}, $init, js, sys, TypeAssertionError, errorString, ptrType$3, init;
	js = $packages["github.com/gopherjs/gopherjs/js"];
	sys = $packages["runtime/internal/sys"];
	TypeAssertionError = $pkg.TypeAssertionError = $newType(0, $kindStruct, "runtime.TypeAssertionError", true, "runtime", true, function(interfaceString_, concreteString_, assertedString_, missingMethod_) {
		this.$val = this;
		if (arguments.length === 0) {
			this.interfaceString = "";
			this.concreteString = "";
			this.assertedString = "";
			this.missingMethod = "";
			return;
		}
		this.interfaceString = interfaceString_;
		this.concreteString = concreteString_;
		this.assertedString = assertedString_;
		this.missingMethod = missingMethod_;
	});
	errorString = $pkg.errorString = $newType(8, $kindString, "runtime.errorString", true, "runtime", false, null);
	ptrType$3 = $ptrType(TypeAssertionError);
	init = function() {
		var $ptr, e, jsPkg;
		jsPkg = $packages[$externalize("github.com/gopherjs/gopherjs/js", $String)];
		$jsObjectPtr = jsPkg.Object.ptr;
		$jsErrorPtr = jsPkg.Error.ptr;
		$throwRuntimeError = (function(msg) {
			var $ptr, msg;
			$panic(new errorString((msg)));
		});
		e = $ifaceNil;
		e = new TypeAssertionError.ptr("", "", "", "");
		$unused(e);
	};
	TypeAssertionError.ptr.prototype.RuntimeError = function() {
		var $ptr;
	};
	TypeAssertionError.prototype.RuntimeError = function() { return this.$val.RuntimeError(); };
	TypeAssertionError.ptr.prototype.Error = function() {
		var $ptr, e, inter;
		e = this;
		inter = e.interfaceString;
		if (inter === "") {
			inter = "interface";
		}
		if (e.concreteString === "") {
			return "interface conversion: " + inter + " is nil, not " + e.assertedString;
		}
		if (e.missingMethod === "") {
			return "interface conversion: " + inter + " is " + e.concreteString + ", not " + e.assertedString;
		}
		return "interface conversion: " + e.concreteString + " is not " + e.assertedString + ": missing method " + e.missingMethod;
	};
	TypeAssertionError.prototype.Error = function() { return this.$val.Error(); };
	errorString.prototype.RuntimeError = function() {
		var $ptr, e;
		e = this.$val;
	};
	$ptrType(errorString).prototype.RuntimeError = function() { return new errorString(this.$get()).RuntimeError(); };
	errorString.prototype.Error = function() {
		var $ptr, e;
		e = this.$val;
		return "runtime error: " + (e);
	};
	$ptrType(errorString).prototype.Error = function() { return new errorString(this.$get()).Error(); };
	ptrType$3.methods = [{prop: "RuntimeError", name: "RuntimeError", pkg: "", typ: $funcType([], [], false)}, {prop: "Error", name: "Error", pkg: "", typ: $funcType([], [$String], false)}];
	errorString.methods = [{prop: "RuntimeError", name: "RuntimeError", pkg: "", typ: $funcType([], [], false)}, {prop: "Error", name: "Error", pkg: "", typ: $funcType([], [$String], false)}];
	TypeAssertionError.init("runtime", [{prop: "interfaceString", name: "interfaceString", exported: false, typ: $String, tag: ""}, {prop: "concreteString", name: "concreteString", exported: false, typ: $String, tag: ""}, {prop: "assertedString", name: "assertedString", exported: false, typ: $String, tag: ""}, {prop: "missingMethod", name: "missingMethod", exported: false, typ: $String, tag: ""}]);
	$init = function() {
		$pkg.$init = function() {};
		/* */ var $f, $c = false, $s = 0, $r; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		$r = js.$init(); /* */ $s = 1; case 1: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
		$r = sys.$init(); /* */ $s = 2; case 2: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
		init();
		/* */ } return; } if ($f === undefined) { $f = { $blk: $init }; } $f.$s = $s; $f.$r = $r; return $f;
	};
	$pkg.$init = $init;
	return $pkg;
})();
$packages["errors"] = (function() {
	var $pkg = {}, $init, errorString, ptrType, New;
	errorString = $pkg.errorString = $newType(0, $kindStruct, "errors.errorString", true, "errors", false, function(s_) {
		this.$val = this;
		if (arguments.length === 0) {
			this.s = "";
			return;
		}
		this.s = s_;
	});
	ptrType = $ptrType(errorString);
	New = function(text) {
		var $ptr, text;
		return new errorString.ptr(text);
	};
	$pkg.New = New;
	errorString.ptr.prototype.Error = function() {
		var $ptr, e;
		e = this;
		return e.s;
	};
	errorString.prototype.Error = function() { return this.$val.Error(); };
	ptrType.methods = [{prop: "Error", name: "Error", pkg: "", typ: $funcType([], [$String], false)}];
	errorString.init("errors", [{prop: "s", name: "s", exported: false, typ: $String, tag: ""}]);
	$init = function() {
		$pkg.$init = function() {};
		/* */ var $f, $c = false, $s = 0, $r; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		/* */ } return; } if ($f === undefined) { $f = { $blk: $init }; } $f.$s = $s; $f.$r = $r; return $f;
	};
	$pkg.$init = $init;
	return $pkg;
})();
$packages["math"] = (function() {
	var $pkg = {}, $init, js, arrayType, arrayType$1, arrayType$2, structType, arrayType$3, math, buf, pow10tab, init, init$1;
	js = $packages["github.com/gopherjs/gopherjs/js"];
	arrayType = $arrayType($Uint32, 2);
	arrayType$1 = $arrayType($Float32, 2);
	arrayType$2 = $arrayType($Float64, 1);
	structType = $structType("math", [{prop: "uint32array", name: "uint32array", exported: false, typ: arrayType, tag: ""}, {prop: "float32array", name: "float32array", exported: false, typ: arrayType$1, tag: ""}, {prop: "float64array", name: "float64array", exported: false, typ: arrayType$2, tag: ""}]);
	arrayType$3 = $arrayType($Float64, 70);
	init = function() {
		var $ptr, ab;
		ab = new ($global.ArrayBuffer)(8);
		buf.uint32array = new ($global.Uint32Array)(ab);
		buf.float32array = new ($global.Float32Array)(ab);
		buf.float64array = new ($global.Float64Array)(ab);
	};
	init$1 = function() {
		var $ptr, _q, i, m, x;
		pow10tab[0] = 1;
		pow10tab[1] = 10;
		i = 2;
		while (true) {
			if (!(i < 70)) { break; }
			m = (_q = i / 2, (_q === _q && _q !== 1/0 && _q !== -1/0) ? _q >> 0 : $throwRuntimeError("integer divide by zero"));
			((i < 0 || i >= pow10tab.length) ? ($throwRuntimeError("index out of range"), undefined) : pow10tab[i] = ((m < 0 || m >= pow10tab.length) ? ($throwRuntimeError("index out of range"), undefined) : pow10tab[m]) * (x = i - m >> 0, ((x < 0 || x >= pow10tab.length) ? ($throwRuntimeError("index out of range"), undefined) : pow10tab[x])));
			i = i + (1) >> 0;
		}
	};
	$init = function() {
		$pkg.$init = function() {};
		/* */ var $f, $c = false, $s = 0, $r; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		$r = js.$init(); /* */ $s = 1; case 1: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
		buf = new structType.ptr(arrayType.zero(), arrayType$1.zero(), arrayType$2.zero());
		pow10tab = arrayType$3.zero();
		math = $global.Math;
		init();
		init$1();
		/* */ } return; } if ($f === undefined) { $f = { $blk: $init }; } $f.$s = $s; $f.$r = $r; return $f;
	};
	$pkg.$init = $init;
	return $pkg;
})();
$packages["unicode/utf8"] = (function() {
	var $pkg = {}, $init, acceptRange, first, acceptRanges, DecodeRuneInString, RuneLen, EncodeRune;
	acceptRange = $pkg.acceptRange = $newType(0, $kindStruct, "utf8.acceptRange", true, "unicode/utf8", false, function(lo_, hi_) {
		this.$val = this;
		if (arguments.length === 0) {
			this.lo = 0;
			this.hi = 0;
			return;
		}
		this.lo = lo_;
		this.hi = hi_;
	});
	DecodeRuneInString = function(s) {
		var $ptr, _tmp, _tmp$1, _tmp$10, _tmp$11, _tmp$12, _tmp$13, _tmp$14, _tmp$15, _tmp$16, _tmp$17, _tmp$2, _tmp$3, _tmp$4, _tmp$5, _tmp$6, _tmp$7, _tmp$8, _tmp$9, accept, mask, n, r, s, s0, s1, s2, s3, size, sz, x, x$1;
		r = 0;
		size = 0;
		n = s.length;
		if (n < 1) {
			_tmp = 65533;
			_tmp$1 = 0;
			r = _tmp;
			size = _tmp$1;
			return [r, size];
		}
		s0 = s.charCodeAt(0);
		x = ((s0 < 0 || s0 >= first.length) ? ($throwRuntimeError("index out of range"), undefined) : first[s0]);
		if (x >= 240) {
			mask = (((x >> 0)) << 31 >> 0) >> 31 >> 0;
			_tmp$2 = ((((s.charCodeAt(0) >> 0)) & ~mask) >> 0) | (65533 & mask);
			_tmp$3 = 1;
			r = _tmp$2;
			size = _tmp$3;
			return [r, size];
		}
		sz = (x & 7) >>> 0;
		accept = $clone((x$1 = x >>> 4 << 24 >>> 24, ((x$1 < 0 || x$1 >= acceptRanges.length) ? ($throwRuntimeError("index out of range"), undefined) : acceptRanges[x$1])), acceptRange);
		if (n < ((sz >> 0))) {
			_tmp$4 = 65533;
			_tmp$5 = 1;
			r = _tmp$4;
			size = _tmp$5;
			return [r, size];
		}
		s1 = s.charCodeAt(1);
		if (s1 < accept.lo || accept.hi < s1) {
			_tmp$6 = 65533;
			_tmp$7 = 1;
			r = _tmp$6;
			size = _tmp$7;
			return [r, size];
		}
		if (sz === 2) {
			_tmp$8 = (((((s0 & 31) >>> 0) >> 0)) << 6 >> 0) | ((((s1 & 63) >>> 0) >> 0));
			_tmp$9 = 2;
			r = _tmp$8;
			size = _tmp$9;
			return [r, size];
		}
		s2 = s.charCodeAt(2);
		if (s2 < 128 || 191 < s2) {
			_tmp$10 = 65533;
			_tmp$11 = 1;
			r = _tmp$10;
			size = _tmp$11;
			return [r, size];
		}
		if (sz === 3) {
			_tmp$12 = ((((((s0 & 15) >>> 0) >> 0)) << 12 >> 0) | (((((s1 & 63) >>> 0) >> 0)) << 6 >> 0)) | ((((s2 & 63) >>> 0) >> 0));
			_tmp$13 = 3;
			r = _tmp$12;
			size = _tmp$13;
			return [r, size];
		}
		s3 = s.charCodeAt(3);
		if (s3 < 128 || 191 < s3) {
			_tmp$14 = 65533;
			_tmp$15 = 1;
			r = _tmp$14;
			size = _tmp$15;
			return [r, size];
		}
		_tmp$16 = (((((((s0 & 7) >>> 0) >> 0)) << 18 >> 0) | (((((s1 & 63) >>> 0) >> 0)) << 12 >> 0)) | (((((s2 & 63) >>> 0) >> 0)) << 6 >> 0)) | ((((s3 & 63) >>> 0) >> 0));
		_tmp$17 = 4;
		r = _tmp$16;
		size = _tmp$17;
		return [r, size];
	};
	$pkg.DecodeRuneInString = DecodeRuneInString;
	RuneLen = function(r) {
		var $ptr, r;
		if (r < 0) {
			return -1;
		} else if (r <= 127) {
			return 1;
		} else if (r <= 2047) {
			return 2;
		} else if (55296 <= r && r <= 57343) {
			return -1;
		} else if (r <= 65535) {
			return 3;
		} else if (r <= 1114111) {
			return 4;
		}
		return -1;
	};
	$pkg.RuneLen = RuneLen;
	EncodeRune = function(p, r) {
		var $ptr, i, p, r;
		i = ((r >>> 0));
		if (i <= 127) {
			(0 >= p.$length ? ($throwRuntimeError("index out of range"), undefined) : p.$array[p.$offset + 0] = ((r << 24 >>> 24)));
			return 1;
		} else if (i <= 2047) {
			$unused((1 >= p.$length ? ($throwRuntimeError("index out of range"), undefined) : p.$array[p.$offset + 1]));
			(0 >= p.$length ? ($throwRuntimeError("index out of range"), undefined) : p.$array[p.$offset + 0] = ((192 | (((r >> 6 >> 0) << 24 >>> 24))) >>> 0));
			(1 >= p.$length ? ($throwRuntimeError("index out of range"), undefined) : p.$array[p.$offset + 1] = ((128 | ((((r << 24 >>> 24)) & 63) >>> 0)) >>> 0));
			return 2;
		} else if ((i > 1114111) || (55296 <= i && i <= 57343)) {
			r = 65533;
			$unused((2 >= p.$length ? ($throwRuntimeError("index out of range"), undefined) : p.$array[p.$offset + 2]));
			(0 >= p.$length ? ($throwRuntimeError("index out of range"), undefined) : p.$array[p.$offset + 0] = ((224 | (((r >> 12 >> 0) << 24 >>> 24))) >>> 0));
			(1 >= p.$length ? ($throwRuntimeError("index out of range"), undefined) : p.$array[p.$offset + 1] = ((128 | (((((r >> 6 >> 0) << 24 >>> 24)) & 63) >>> 0)) >>> 0));
			(2 >= p.$length ? ($throwRuntimeError("index out of range"), undefined) : p.$array[p.$offset + 2] = ((128 | ((((r << 24 >>> 24)) & 63) >>> 0)) >>> 0));
			return 3;
		} else if (i <= 65535) {
			$unused((2 >= p.$length ? ($throwRuntimeError("index out of range"), undefined) : p.$array[p.$offset + 2]));
			(0 >= p.$length ? ($throwRuntimeError("index out of range"), undefined) : p.$array[p.$offset + 0] = ((224 | (((r >> 12 >> 0) << 24 >>> 24))) >>> 0));
			(1 >= p.$length ? ($throwRuntimeError("index out of range"), undefined) : p.$array[p.$offset + 1] = ((128 | (((((r >> 6 >> 0) << 24 >>> 24)) & 63) >>> 0)) >>> 0));
			(2 >= p.$length ? ($throwRuntimeError("index out of range"), undefined) : p.$array[p.$offset + 2] = ((128 | ((((r << 24 >>> 24)) & 63) >>> 0)) >>> 0));
			return 3;
		} else {
			$unused((3 >= p.$length ? ($throwRuntimeError("index out of range"), undefined) : p.$array[p.$offset + 3]));
			(0 >= p.$length ? ($throwRuntimeError("index out of range"), undefined) : p.$array[p.$offset + 0] = ((240 | (((r >> 18 >> 0) << 24 >>> 24))) >>> 0));
			(1 >= p.$length ? ($throwRuntimeError("index out of range"), undefined) : p.$array[p.$offset + 1] = ((128 | (((((r >> 12 >> 0) << 24 >>> 24)) & 63) >>> 0)) >>> 0));
			(2 >= p.$length ? ($throwRuntimeError("index out of range"), undefined) : p.$array[p.$offset + 2] = ((128 | (((((r >> 6 >> 0) << 24 >>> 24)) & 63) >>> 0)) >>> 0));
			(3 >= p.$length ? ($throwRuntimeError("index out of range"), undefined) : p.$array[p.$offset + 3] = ((128 | ((((r << 24 >>> 24)) & 63) >>> 0)) >>> 0));
			return 4;
		}
	};
	$pkg.EncodeRune = EncodeRune;
	acceptRange.init("unicode/utf8", [{prop: "lo", name: "lo", exported: false, typ: $Uint8, tag: ""}, {prop: "hi", name: "hi", exported: false, typ: $Uint8, tag: ""}]);
	$init = function() {
		$pkg.$init = function() {};
		/* */ var $f, $c = false, $s = 0, $r; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		first = $toNativeArray($kindUint8, [240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 240, 241, 241, 241, 241, 241, 241, 241, 241, 241, 241, 241, 241, 241, 241, 241, 241, 241, 241, 241, 241, 241, 241, 241, 241, 241, 241, 241, 241, 241, 241, 241, 241, 241, 241, 241, 241, 241, 241, 241, 241, 241, 241, 241, 241, 241, 241, 241, 241, 241, 241, 241, 241, 241, 241, 241, 241, 241, 241, 241, 241, 241, 241, 241, 241, 241, 241, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 19, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 35, 3, 3, 52, 4, 4, 4, 68, 241, 241, 241, 241, 241, 241, 241, 241, 241, 241, 241]);
		acceptRanges = $toNativeArray($kindStruct, [new acceptRange.ptr(128, 191), new acceptRange.ptr(160, 191), new acceptRange.ptr(128, 159), new acceptRange.ptr(144, 191), new acceptRange.ptr(128, 143)]);
		/* */ } return; } if ($f === undefined) { $f = { $blk: $init }; } $f.$s = $s; $f.$r = $r; return $f;
	};
	$pkg.$init = $init;
	return $pkg;
})();
$packages["strconv"] = (function() {
	var $pkg = {}, $init, errors, math, utf8, sliceType$6, arrayType$3, arrayType$4, shifts, FormatInt, Itoa, formatBits, unhex, UnquoteChar, Unquote, contains;
	errors = $packages["errors"];
	math = $packages["math"];
	utf8 = $packages["unicode/utf8"];
	sliceType$6 = $sliceType($Uint8);
	arrayType$3 = $arrayType($Uint8, 65);
	arrayType$4 = $arrayType($Uint8, 4);
	FormatInt = function(i, base) {
		var $ptr, _tuple, base, i, s;
		_tuple = formatBits(sliceType$6.nil, (new $Uint64(i.$high, i.$low)), base, (i.$high < 0 || (i.$high === 0 && i.$low < 0)), false);
		s = _tuple[1];
		return s;
	};
	$pkg.FormatInt = FormatInt;
	Itoa = function(i) {
		var $ptr, i;
		return FormatInt((new $Int64(0, i)), 10);
	};
	$pkg.Itoa = Itoa;
	formatBits = function(dst, u, base, neg, append_) {
		var $ptr, _q, _q$1, a, append_, b, b$1, base, d, dst, i, j, m, neg, q, q$1, q$2, qs, s, s$1, u, us, us$1, x, x$1;
		d = sliceType$6.nil;
		s = "";
		if (base < 2 || base > 36) {
			$panic(new $String("strconv: illegal AppendInt/FormatInt base"));
		}
		a = arrayType$3.zero();
		i = 65;
		if (neg) {
			u = new $Uint64(-u.$high, -u.$low);
		}
		if (base === 10) {
			if (true) {
				while (true) {
					if (!((u.$high > 0 || (u.$high === 0 && u.$low > 4294967295)))) { break; }
					q = $div64(u, new $Uint64(0, 1000000000), false);
					us = (((x = $mul64(q, new $Uint64(0, 1000000000)), new $Uint64(u.$high - x.$high, u.$low - x.$low)).$low >>> 0));
					j = 9;
					while (true) {
						if (!(j > 0)) { break; }
						i = i - (1) >> 0;
						qs = (_q = us / 10, (_q === _q && _q !== 1/0 && _q !== -1/0) ? _q >>> 0 : $throwRuntimeError("integer divide by zero"));
						((i < 0 || i >= a.length) ? ($throwRuntimeError("index out of range"), undefined) : a[i] = ((((us - ($imul(qs, 10) >>> 0) >>> 0) + 48 >>> 0) << 24 >>> 24)));
						us = qs;
						j = j - (1) >> 0;
					}
					u = q;
				}
			}
			us$1 = ((u.$low >>> 0));
			while (true) {
				if (!(us$1 >= 10)) { break; }
				i = i - (1) >> 0;
				q$1 = (_q$1 = us$1 / 10, (_q$1 === _q$1 && _q$1 !== 1/0 && _q$1 !== -1/0) ? _q$1 >>> 0 : $throwRuntimeError("integer divide by zero"));
				((i < 0 || i >= a.length) ? ($throwRuntimeError("index out of range"), undefined) : a[i] = ((((us$1 - ($imul(q$1, 10) >>> 0) >>> 0) + 48 >>> 0) << 24 >>> 24)));
				us$1 = q$1;
			}
			i = i - (1) >> 0;
			((i < 0 || i >= a.length) ? ($throwRuntimeError("index out of range"), undefined) : a[i] = (((us$1 + 48 >>> 0) << 24 >>> 24)));
		} else {
			s$1 = ((base < 0 || base >= shifts.length) ? ($throwRuntimeError("index out of range"), undefined) : shifts[base]);
			if (s$1 > 0) {
				b = (new $Uint64(0, base));
				m = ((b.$low >>> 0)) - 1 >>> 0;
				while (true) {
					if (!((u.$high > b.$high || (u.$high === b.$high && u.$low >= b.$low)))) { break; }
					i = i - (1) >> 0;
					((i < 0 || i >= a.length) ? ($throwRuntimeError("index out of range"), undefined) : a[i] = "0123456789abcdefghijklmnopqrstuvwxyz".charCodeAt(((((u.$low >>> 0)) & m) >>> 0)));
					u = $shiftRightUint64(u, (s$1));
				}
				i = i - (1) >> 0;
				((i < 0 || i >= a.length) ? ($throwRuntimeError("index out of range"), undefined) : a[i] = "0123456789abcdefghijklmnopqrstuvwxyz".charCodeAt(((u.$low >>> 0))));
			} else {
				b$1 = (new $Uint64(0, base));
				while (true) {
					if (!((u.$high > b$1.$high || (u.$high === b$1.$high && u.$low >= b$1.$low)))) { break; }
					i = i - (1) >> 0;
					q$2 = $div64(u, b$1, false);
					((i < 0 || i >= a.length) ? ($throwRuntimeError("index out of range"), undefined) : a[i] = "0123456789abcdefghijklmnopqrstuvwxyz".charCodeAt((((x$1 = $mul64(q$2, b$1), new $Uint64(u.$high - x$1.$high, u.$low - x$1.$low)).$low >>> 0))));
					u = q$2;
				}
				i = i - (1) >> 0;
				((i < 0 || i >= a.length) ? ($throwRuntimeError("index out of range"), undefined) : a[i] = "0123456789abcdefghijklmnopqrstuvwxyz".charCodeAt(((u.$low >>> 0))));
			}
		}
		if (neg) {
			i = i - (1) >> 0;
			((i < 0 || i >= a.length) ? ($throwRuntimeError("index out of range"), undefined) : a[i] = 45);
		}
		if (append_) {
			d = $appendSlice(dst, $subslice(new sliceType$6(a), i));
			return [d, s];
		}
		s = ($bytesToString($subslice(new sliceType$6(a), i)));
		return [d, s];
	};
	unhex = function(b) {
		var $ptr, _tmp, _tmp$1, _tmp$2, _tmp$3, _tmp$4, _tmp$5, b, c, ok, v;
		v = 0;
		ok = false;
		c = ((b >> 0));
		if (48 <= c && c <= 57) {
			_tmp = c - 48 >> 0;
			_tmp$1 = true;
			v = _tmp;
			ok = _tmp$1;
			return [v, ok];
		} else if (97 <= c && c <= 102) {
			_tmp$2 = (c - 97 >> 0) + 10 >> 0;
			_tmp$3 = true;
			v = _tmp$2;
			ok = _tmp$3;
			return [v, ok];
		} else if (65 <= c && c <= 70) {
			_tmp$4 = (c - 65 >> 0) + 10 >> 0;
			_tmp$5 = true;
			v = _tmp$4;
			ok = _tmp$5;
			return [v, ok];
		}
		return [v, ok];
	};
	UnquoteChar = function(s, quote) {
		var $ptr, _1, _2, _tmp, _tmp$1, _tmp$2, _tmp$3, _tmp$4, _tmp$5, _tmp$6, _tmp$7, _tuple, _tuple$1, c, c$1, err, j, j$1, multibyte, n, ok, quote, r, s, size, tail, v, v$1, value, x, x$1;
		value = 0;
		multibyte = false;
		tail = "";
		err = $ifaceNil;
		c = s.charCodeAt(0);
		if ((c === quote) && ((quote === 39) || (quote === 34))) {
			err = $pkg.ErrSyntax;
			return [value, multibyte, tail, err];
		} else if (c >= 128) {
			_tuple = utf8.DecodeRuneInString(s);
			r = _tuple[0];
			size = _tuple[1];
			_tmp = r;
			_tmp$1 = true;
			_tmp$2 = $substring(s, size);
			_tmp$3 = $ifaceNil;
			value = _tmp;
			multibyte = _tmp$1;
			tail = _tmp$2;
			err = _tmp$3;
			return [value, multibyte, tail, err];
		} else if (!((c === 92))) {
			_tmp$4 = ((s.charCodeAt(0) >> 0));
			_tmp$5 = false;
			_tmp$6 = $substring(s, 1);
			_tmp$7 = $ifaceNil;
			value = _tmp$4;
			multibyte = _tmp$5;
			tail = _tmp$6;
			err = _tmp$7;
			return [value, multibyte, tail, err];
		}
		if (s.length <= 1) {
			err = $pkg.ErrSyntax;
			return [value, multibyte, tail, err];
		}
		c$1 = s.charCodeAt(1);
		s = $substring(s, 2);
		switch (0) { default:
			_1 = c$1;
			if (_1 === (97)) {
				value = 7;
			} else if (_1 === (98)) {
				value = 8;
			} else if (_1 === (102)) {
				value = 12;
			} else if (_1 === (110)) {
				value = 10;
			} else if (_1 === (114)) {
				value = 13;
			} else if (_1 === (116)) {
				value = 9;
			} else if (_1 === (118)) {
				value = 11;
			} else if ((_1 === (120)) || (_1 === (117)) || (_1 === (85))) {
				n = 0;
				_2 = c$1;
				if (_2 === (120)) {
					n = 2;
				} else if (_2 === (117)) {
					n = 4;
				} else if (_2 === (85)) {
					n = 8;
				}
				v = 0;
				if (s.length < n) {
					err = $pkg.ErrSyntax;
					return [value, multibyte, tail, err];
				}
				j = 0;
				while (true) {
					if (!(j < n)) { break; }
					_tuple$1 = unhex(s.charCodeAt(j));
					x = _tuple$1[0];
					ok = _tuple$1[1];
					if (!ok) {
						err = $pkg.ErrSyntax;
						return [value, multibyte, tail, err];
					}
					v = (v << 4 >> 0) | x;
					j = j + (1) >> 0;
				}
				s = $substring(s, n);
				if (c$1 === 120) {
					value = v;
					break;
				}
				if (v > 1114111) {
					err = $pkg.ErrSyntax;
					return [value, multibyte, tail, err];
				}
				value = v;
				multibyte = true;
			} else if ((_1 === (48)) || (_1 === (49)) || (_1 === (50)) || (_1 === (51)) || (_1 === (52)) || (_1 === (53)) || (_1 === (54)) || (_1 === (55))) {
				v$1 = ((c$1 >> 0)) - 48 >> 0;
				if (s.length < 2) {
					err = $pkg.ErrSyntax;
					return [value, multibyte, tail, err];
				}
				j$1 = 0;
				while (true) {
					if (!(j$1 < 2)) { break; }
					x$1 = ((s.charCodeAt(j$1) >> 0)) - 48 >> 0;
					if (x$1 < 0 || x$1 > 7) {
						err = $pkg.ErrSyntax;
						return [value, multibyte, tail, err];
					}
					v$1 = ((v$1 << 3 >> 0)) | x$1;
					j$1 = j$1 + (1) >> 0;
				}
				s = $substring(s, 2);
				if (v$1 > 255) {
					err = $pkg.ErrSyntax;
					return [value, multibyte, tail, err];
				}
				value = v$1;
			} else if (_1 === (92)) {
				value = 92;
			} else if ((_1 === (39)) || (_1 === (34))) {
				if (!((c$1 === quote))) {
					err = $pkg.ErrSyntax;
					return [value, multibyte, tail, err];
				}
				value = ((c$1 >> 0));
			} else {
				err = $pkg.ErrSyntax;
				return [value, multibyte, tail, err];
			}
		}
		tail = s;
		return [value, multibyte, tail, err];
	};
	$pkg.UnquoteChar = UnquoteChar;
	Unquote = function(s) {
		var $ptr, _1, _q, _tuple, _tuple$1, buf, buf$1, c, err, i, multibyte, n, n$1, quote, r, runeTmp, s, size, ss;
		n = s.length;
		if (n < 2) {
			return ["", $pkg.ErrSyntax];
		}
		quote = s.charCodeAt(0);
		if (!((quote === s.charCodeAt((n - 1 >> 0))))) {
			return ["", $pkg.ErrSyntax];
		}
		s = $substring(s, 1, (n - 1 >> 0));
		if (quote === 96) {
			if (contains(s, 96)) {
				return ["", $pkg.ErrSyntax];
			}
			if (contains(s, 13)) {
				buf = $makeSlice(sliceType$6, 0, (s.length - 1 >> 0));
				i = 0;
				while (true) {
					if (!(i < s.length)) { break; }
					if (!((s.charCodeAt(i) === 13))) {
						buf = $append(buf, s.charCodeAt(i));
					}
					i = i + (1) >> 0;
				}
				return [($bytesToString(buf)), $ifaceNil];
			}
			return [s, $ifaceNil];
		}
		if (!((quote === 34)) && !((quote === 39))) {
			return ["", $pkg.ErrSyntax];
		}
		if (contains(s, 10)) {
			return ["", $pkg.ErrSyntax];
		}
		if (!contains(s, 92) && !contains(s, quote)) {
			_1 = quote;
			if (_1 === (34)) {
				return [s, $ifaceNil];
			} else if (_1 === (39)) {
				_tuple = utf8.DecodeRuneInString(s);
				r = _tuple[0];
				size = _tuple[1];
				if ((size === s.length) && (!((r === 65533)) || !((size === 1)))) {
					return [s, $ifaceNil];
				}
			}
		}
		runeTmp = arrayType$4.zero();
		buf$1 = $makeSlice(sliceType$6, 0, (_q = ($imul(3, s.length)) / 2, (_q === _q && _q !== 1/0 && _q !== -1/0) ? _q >> 0 : $throwRuntimeError("integer divide by zero")));
		while (true) {
			if (!(s.length > 0)) { break; }
			_tuple$1 = UnquoteChar(s, quote);
			c = _tuple$1[0];
			multibyte = _tuple$1[1];
			ss = _tuple$1[2];
			err = _tuple$1[3];
			if (!($interfaceIsEqual(err, $ifaceNil))) {
				return ["", err];
			}
			s = ss;
			if (c < 128 || !multibyte) {
				buf$1 = $append(buf$1, ((c << 24 >>> 24)));
			} else {
				n$1 = utf8.EncodeRune(new sliceType$6(runeTmp), c);
				buf$1 = $appendSlice(buf$1, $subslice(new sliceType$6(runeTmp), 0, n$1));
			}
			if ((quote === 39) && !((s.length === 0))) {
				return ["", $pkg.ErrSyntax];
			}
		}
		return [($bytesToString(buf$1)), $ifaceNil];
	};
	$pkg.Unquote = Unquote;
	contains = function(s, c) {
		var $ptr, c, i, s;
		i = 0;
		while (true) {
			if (!(i < s.length)) { break; }
			if (s.charCodeAt(i) === c) {
				return true;
			}
			i = i + (1) >> 0;
		}
		return false;
	};
	$init = function() {
		$pkg.$init = function() {};
		/* */ var $f, $c = false, $s = 0, $r; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		$r = errors.$init(); /* */ $s = 1; case 1: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
		$r = math.$init(); /* */ $s = 2; case 2: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
		$r = utf8.$init(); /* */ $s = 3; case 3: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
		$pkg.ErrRange = errors.New("value out of range");
		$pkg.ErrSyntax = errors.New("invalid syntax");
		shifts = $toNativeArray($kindUint, [0, 0, 1, 0, 2, 0, 0, 0, 3, 0, 0, 0, 0, 0, 0, 0, 4, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 5, 0, 0, 0, 0]);
		/* */ } return; } if ($f === undefined) { $f = { $blk: $init }; } $f.$s = $s; $f.$r = $r; return $f;
	};
	$pkg.$init = $init;
	return $pkg;
})();
$packages["internal/race"] = (function() {
	var $pkg = {}, $init, Acquire, Release, ReleaseMerge, Disable, Enable;
	Acquire = function(addr) {
		var $ptr, addr;
	};
	$pkg.Acquire = Acquire;
	Release = function(addr) {
		var $ptr, addr;
	};
	$pkg.Release = Release;
	ReleaseMerge = function(addr) {
		var $ptr, addr;
	};
	$pkg.ReleaseMerge = ReleaseMerge;
	Disable = function() {
		var $ptr;
	};
	$pkg.Disable = Disable;
	Enable = function() {
		var $ptr;
	};
	$pkg.Enable = Enable;
	$init = function() {
		$pkg.$init = function() {};
		/* */ var $f, $c = false, $s = 0, $r; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		/* */ } return; } if ($f === undefined) { $f = { $blk: $init }; } $f.$s = $s; $f.$r = $r; return $f;
	};
	$pkg.$init = $init;
	return $pkg;
})();
$packages["sync/atomic"] = (function() {
	var $pkg = {}, $init, js, CompareAndSwapInt32, AddInt32;
	js = $packages["github.com/gopherjs/gopherjs/js"];
	CompareAndSwapInt32 = function(addr, old, new$1) {
		var $ptr, addr, new$1, old;
		if (addr.$get() === old) {
			addr.$set(new$1);
			return true;
		}
		return false;
	};
	$pkg.CompareAndSwapInt32 = CompareAndSwapInt32;
	AddInt32 = function(addr, delta) {
		var $ptr, addr, delta, new$1;
		new$1 = addr.$get() + delta >> 0;
		addr.$set(new$1);
		return new$1;
	};
	$pkg.AddInt32 = AddInt32;
	$init = function() {
		$pkg.$init = function() {};
		/* */ var $f, $c = false, $s = 0, $r; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		$r = js.$init(); /* */ $s = 1; case 1: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
		/* */ } return; } if ($f === undefined) { $f = { $blk: $init }; } $f.$s = $s; $f.$r = $r; return $f;
	};
	$pkg.$init = $init;
	return $pkg;
})();
$packages["sync"] = (function() {
	var $pkg = {}, $init, race, runtime, atomic, Pool, Mutex, Locker, poolLocal, notifyList, RWMutex, rlocker, ptrType, sliceType, ptrType$1, chanType, sliceType$1, ptrType$3, ptrType$6, sliceType$4, ptrType$7, ptrType$8, funcType, ptrType$14, arrayType$2, semWaiters, runtime_SemacquireMutex, allPools, runtime_registerPoolCleanup, runtime_Semacquire, runtime_Semrelease, runtime_notifyListCheck, runtime_canSpin, throw$1, poolCleanup, init, indexLocal, init$1, runtime_doSpin;
	race = $packages["internal/race"];
	runtime = $packages["runtime"];
	atomic = $packages["sync/atomic"];
	Pool = $pkg.Pool = $newType(0, $kindStruct, "sync.Pool", true, "sync", true, function(local_, localSize_, store_, New_) {
		this.$val = this;
		if (arguments.length === 0) {
			this.local = 0;
			this.localSize = 0;
			this.store = sliceType$4.nil;
			this.New = $throwNilPointerError;
			return;
		}
		this.local = local_;
		this.localSize = localSize_;
		this.store = store_;
		this.New = New_;
	});
	Mutex = $pkg.Mutex = $newType(0, $kindStruct, "sync.Mutex", true, "sync", true, function(state_, sema_) {
		this.$val = this;
		if (arguments.length === 0) {
			this.state = 0;
			this.sema = 0;
			return;
		}
		this.state = state_;
		this.sema = sema_;
	});
	Locker = $pkg.Locker = $newType(8, $kindInterface, "sync.Locker", true, "sync", true, null);
	poolLocal = $pkg.poolLocal = $newType(0, $kindStruct, "sync.poolLocal", true, "sync", false, function(private$0_, shared_, Mutex_, pad_) {
		this.$val = this;
		if (arguments.length === 0) {
			this.private$0 = $ifaceNil;
			this.shared = sliceType$4.nil;
			this.Mutex = new Mutex.ptr(0, 0);
			this.pad = arrayType$2.zero();
			return;
		}
		this.private$0 = private$0_;
		this.shared = shared_;
		this.Mutex = Mutex_;
		this.pad = pad_;
	});
	notifyList = $pkg.notifyList = $newType(0, $kindStruct, "sync.notifyList", true, "sync", false, function(wait_, notify_, lock_, head_, tail_) {
		this.$val = this;
		if (arguments.length === 0) {
			this.wait = 0;
			this.notify = 0;
			this.lock = 0;
			this.head = 0;
			this.tail = 0;
			return;
		}
		this.wait = wait_;
		this.notify = notify_;
		this.lock = lock_;
		this.head = head_;
		this.tail = tail_;
	});
	RWMutex = $pkg.RWMutex = $newType(0, $kindStruct, "sync.RWMutex", true, "sync", true, function(w_, writerSem_, readerSem_, readerCount_, readerWait_) {
		this.$val = this;
		if (arguments.length === 0) {
			this.w = new Mutex.ptr(0, 0);
			this.writerSem = 0;
			this.readerSem = 0;
			this.readerCount = 0;
			this.readerWait = 0;
			return;
		}
		this.w = w_;
		this.writerSem = writerSem_;
		this.readerSem = readerSem_;
		this.readerCount = readerCount_;
		this.readerWait = readerWait_;
	});
	rlocker = $pkg.rlocker = $newType(0, $kindStruct, "sync.rlocker", true, "sync", false, function(w_, writerSem_, readerSem_, readerCount_, readerWait_) {
		this.$val = this;
		if (arguments.length === 0) {
			this.w = new Mutex.ptr(0, 0);
			this.writerSem = 0;
			this.readerSem = 0;
			this.readerCount = 0;
			this.readerWait = 0;
			return;
		}
		this.w = w_;
		this.writerSem = writerSem_;
		this.readerSem = readerSem_;
		this.readerCount = readerCount_;
		this.readerWait = readerWait_;
	});
	ptrType = $ptrType(Pool);
	sliceType = $sliceType(ptrType);
	ptrType$1 = $ptrType($Uint32);
	chanType = $chanType($Bool, false, false);
	sliceType$1 = $sliceType(chanType);
	ptrType$3 = $ptrType($Int32);
	ptrType$6 = $ptrType(poolLocal);
	sliceType$4 = $sliceType($emptyInterface);
	ptrType$7 = $ptrType(rlocker);
	ptrType$8 = $ptrType(RWMutex);
	funcType = $funcType([], [$emptyInterface], false);
	ptrType$14 = $ptrType(Mutex);
	arrayType$2 = $arrayType($Uint8, 128);
	Pool.ptr.prototype.Get = function() {
		var $ptr, _r, p, x, x$1, x$2, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; $ptr = $f.$ptr; _r = $f._r; p = $f.p; x = $f.x; x$1 = $f.x$1; x$2 = $f.x$2; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		p = this;
		/* */ if (p.store.$length === 0) { $s = 1; continue; }
		/* */ $s = 2; continue;
		/* if (p.store.$length === 0) { */ case 1:
			/* */ if (!(p.New === $throwNilPointerError)) { $s = 3; continue; }
			/* */ $s = 4; continue;
			/* if (!(p.New === $throwNilPointerError)) { */ case 3:
				_r = p.New(); /* */ $s = 5; case 5: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
				$s = -1; return _r;
			/* } */ case 4:
			$s = -1; return $ifaceNil;
		/* } */ case 2:
		x$2 = (x = p.store, x$1 = p.store.$length - 1 >> 0, ((x$1 < 0 || x$1 >= x.$length) ? ($throwRuntimeError("index out of range"), undefined) : x.$array[x.$offset + x$1]));
		p.store = $subslice(p.store, 0, (p.store.$length - 1 >> 0));
		$s = -1; return x$2;
		/* */ } return; } if ($f === undefined) { $f = { $blk: Pool.ptr.prototype.Get }; } $f.$ptr = $ptr; $f._r = _r; $f.p = p; $f.x = x; $f.x$1 = x$1; $f.x$2 = x$2; $f.$s = $s; $f.$r = $r; return $f;
	};
	Pool.prototype.Get = function() { return this.$val.Get(); };
	Pool.ptr.prototype.Put = function(x) {
		var $ptr, p, x;
		p = this;
		if ($interfaceIsEqual(x, $ifaceNil)) {
			return;
		}
		p.store = $append(p.store, x);
	};
	Pool.prototype.Put = function(x) { return this.$val.Put(x); };
	runtime_registerPoolCleanup = function(cleanup) {
		var $ptr, cleanup;
	};
	runtime_Semacquire = function(s) {
		var $ptr, _entry, _key, _r, ch, s, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; $ptr = $f.$ptr; _entry = $f._entry; _key = $f._key; _r = $f._r; ch = $f.ch; s = $f.s; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		/* */ if (s.$get() === 0) { $s = 1; continue; }
		/* */ $s = 2; continue;
		/* if (s.$get() === 0) { */ case 1:
			ch = new $Chan($Bool, 0);
			_key = s; (semWaiters || $throwRuntimeError("assignment to entry in nil map"))[ptrType$1.keyFor(_key)] = { k: _key, v: $append((_entry = semWaiters[ptrType$1.keyFor(s)], _entry !== undefined ? _entry.v : sliceType$1.nil), ch) };
			_r = $recv(ch); /* */ $s = 3; case 3: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
			_r[0];
		/* } */ case 2:
		s.$set(s.$get() - (1) >>> 0);
		$s = -1; return;
		/* */ } return; } if ($f === undefined) { $f = { $blk: runtime_Semacquire }; } $f.$ptr = $ptr; $f._entry = _entry; $f._key = _key; $f._r = _r; $f.ch = ch; $f.s = s; $f.$s = $s; $f.$r = $r; return $f;
	};
	runtime_Semrelease = function(s) {
		var $ptr, _entry, _key, ch, s, w, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; $ptr = $f.$ptr; _entry = $f._entry; _key = $f._key; ch = $f.ch; s = $f.s; w = $f.w; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		s.$set(s.$get() + (1) >>> 0);
		w = (_entry = semWaiters[ptrType$1.keyFor(s)], _entry !== undefined ? _entry.v : sliceType$1.nil);
		if (w.$length === 0) {
			$s = -1; return;
		}
		ch = (0 >= w.$length ? ($throwRuntimeError("index out of range"), undefined) : w.$array[w.$offset + 0]);
		w = $subslice(w, 1);
		_key = s; (semWaiters || $throwRuntimeError("assignment to entry in nil map"))[ptrType$1.keyFor(_key)] = { k: _key, v: w };
		if (w.$length === 0) {
			delete semWaiters[ptrType$1.keyFor(s)];
		}
		$r = $send(ch, true); /* */ $s = 1; case 1: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
		$s = -1; return;
		/* */ } return; } if ($f === undefined) { $f = { $blk: runtime_Semrelease }; } $f.$ptr = $ptr; $f._entry = _entry; $f._key = _key; $f.ch = ch; $f.s = s; $f.w = w; $f.$s = $s; $f.$r = $r; return $f;
	};
	runtime_notifyListCheck = function(size) {
		var $ptr, size;
	};
	runtime_canSpin = function(i) {
		var $ptr, i;
		return false;
	};
	throw$1 = function() {
		$throwRuntimeError("native function not implemented: sync.throw");
	};
	Mutex.ptr.prototype.Lock = function() {
		var $ptr, awoke, iter, m, new$1, old, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; $ptr = $f.$ptr; awoke = $f.awoke; iter = $f.iter; m = $f.m; new$1 = $f.new$1; old = $f.old; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		m = this;
		if (atomic.CompareAndSwapInt32((m.$ptr_state || (m.$ptr_state = new ptrType$3(function() { return this.$target.state; }, function($v) { this.$target.state = $v; }, m))), 0, 1)) {
			if (false) {
				race.Acquire((m));
			}
			$s = -1; return;
		}
		awoke = false;
		iter = 0;
		/* while (true) { */ case 1:
			old = m.state;
			new$1 = old | 1;
			/* */ if (!(((old & 1) === 0))) { $s = 3; continue; }
			/* */ $s = 4; continue;
			/* if (!(((old & 1) === 0))) { */ case 3:
				if (runtime_canSpin(iter)) {
					if (!awoke && ((old & 2) === 0) && !(((old >> 2 >> 0) === 0)) && atomic.CompareAndSwapInt32((m.$ptr_state || (m.$ptr_state = new ptrType$3(function() { return this.$target.state; }, function($v) { this.$target.state = $v; }, m))), old, old | 2)) {
						awoke = true;
					}
					runtime_doSpin();
					iter = iter + (1) >> 0;
					/* continue; */ $s = 1; continue;
				}
				new$1 = old + 4 >> 0;
			/* } */ case 4:
			if (awoke) {
				if ((new$1 & 2) === 0) {
					throw$1("sync: inconsistent mutex state");
				}
				new$1 = (new$1 & ~(2)) >> 0;
			}
			/* */ if (atomic.CompareAndSwapInt32((m.$ptr_state || (m.$ptr_state = new ptrType$3(function() { return this.$target.state; }, function($v) { this.$target.state = $v; }, m))), old, new$1)) { $s = 5; continue; }
			/* */ $s = 6; continue;
			/* if (atomic.CompareAndSwapInt32((m.$ptr_state || (m.$ptr_state = new ptrType$3(function() { return this.$target.state; }, function($v) { this.$target.state = $v; }, m))), old, new$1)) { */ case 5:
				if ((old & 1) === 0) {
					/* break; */ $s = 2; continue;
				}
				$r = runtime_SemacquireMutex((m.$ptr_sema || (m.$ptr_sema = new ptrType$1(function() { return this.$target.sema; }, function($v) { this.$target.sema = $v; }, m)))); /* */ $s = 7; case 7: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
				awoke = true;
				iter = 0;
			/* } */ case 6:
		/* } */ $s = 1; continue; case 2:
		if (false) {
			race.Acquire((m));
		}
		$s = -1; return;
		/* */ } return; } if ($f === undefined) { $f = { $blk: Mutex.ptr.prototype.Lock }; } $f.$ptr = $ptr; $f.awoke = awoke; $f.iter = iter; $f.m = m; $f.new$1 = new$1; $f.old = old; $f.$s = $s; $f.$r = $r; return $f;
	};
	Mutex.prototype.Lock = function() { return this.$val.Lock(); };
	Mutex.ptr.prototype.Unlock = function() {
		var $ptr, m, new$1, old, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; $ptr = $f.$ptr; m = $f.m; new$1 = $f.new$1; old = $f.old; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		m = this;
		if (false) {
			$unused(m.state);
			race.Release((m));
		}
		new$1 = atomic.AddInt32((m.$ptr_state || (m.$ptr_state = new ptrType$3(function() { return this.$target.state; }, function($v) { this.$target.state = $v; }, m))), -1);
		if ((((new$1 + 1 >> 0)) & 1) === 0) {
			throw$1("sync: unlock of unlocked mutex");
		}
		old = new$1;
		/* while (true) { */ case 1:
			if (((old >> 2 >> 0) === 0) || !(((old & 3) === 0))) {
				$s = -1; return;
			}
			new$1 = ((old - 4 >> 0)) | 2;
			/* */ if (atomic.CompareAndSwapInt32((m.$ptr_state || (m.$ptr_state = new ptrType$3(function() { return this.$target.state; }, function($v) { this.$target.state = $v; }, m))), old, new$1)) { $s = 3; continue; }
			/* */ $s = 4; continue;
			/* if (atomic.CompareAndSwapInt32((m.$ptr_state || (m.$ptr_state = new ptrType$3(function() { return this.$target.state; }, function($v) { this.$target.state = $v; }, m))), old, new$1)) { */ case 3:
				$r = runtime_Semrelease((m.$ptr_sema || (m.$ptr_sema = new ptrType$1(function() { return this.$target.sema; }, function($v) { this.$target.sema = $v; }, m)))); /* */ $s = 5; case 5: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
				$s = -1; return;
			/* } */ case 4:
			old = m.state;
		/* } */ $s = 1; continue; case 2:
		$s = -1; return;
		/* */ } return; } if ($f === undefined) { $f = { $blk: Mutex.ptr.prototype.Unlock }; } $f.$ptr = $ptr; $f.m = m; $f.new$1 = new$1; $f.old = old; $f.$s = $s; $f.$r = $r; return $f;
	};
	Mutex.prototype.Unlock = function() { return this.$val.Unlock(); };
	poolCleanup = function() {
		var $ptr, _i, _i$1, _ref, _ref$1, i, i$1, j, l, p, x;
		_ref = allPools;
		_i = 0;
		while (true) {
			if (!(_i < _ref.$length)) { break; }
			i = _i;
			p = ((_i < 0 || _i >= _ref.$length) ? ($throwRuntimeError("index out of range"), undefined) : _ref.$array[_ref.$offset + _i]);
			((i < 0 || i >= allPools.$length) ? ($throwRuntimeError("index out of range"), undefined) : allPools.$array[allPools.$offset + i] = ptrType.nil);
			i$1 = 0;
			while (true) {
				if (!(i$1 < ((p.localSize >> 0)))) { break; }
				l = indexLocal(p.local, i$1);
				l.private$0 = $ifaceNil;
				_ref$1 = l.shared;
				_i$1 = 0;
				while (true) {
					if (!(_i$1 < _ref$1.$length)) { break; }
					j = _i$1;
					(x = l.shared, ((j < 0 || j >= x.$length) ? ($throwRuntimeError("index out of range"), undefined) : x.$array[x.$offset + j] = $ifaceNil));
					_i$1++;
				}
				l.shared = sliceType$4.nil;
				i$1 = i$1 + (1) >> 0;
			}
			p.local = 0;
			p.localSize = 0;
			_i++;
		}
		allPools = new sliceType([]);
	};
	init = function() {
		var $ptr;
		runtime_registerPoolCleanup(poolCleanup);
	};
	indexLocal = function(l, i) {
		var $ptr, i, l, x;
		return (x = (l), (x.nilCheck, ((i < 0 || i >= x.length) ? ($throwRuntimeError("index out of range"), undefined) : x[i])));
	};
	init$1 = function() {
		var $ptr, n;
		n = new notifyList.ptr(0, 0, 0, 0, 0);
		runtime_notifyListCheck(20);
	};
	runtime_doSpin = function() {
		$throwRuntimeError("native function not implemented: sync.runtime_doSpin");
	};
	RWMutex.ptr.prototype.RLock = function() {
		var $ptr, rw, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; $ptr = $f.$ptr; rw = $f.rw; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		rw = this;
		if (false) {
			$unused(rw.w.state);
			race.Disable();
		}
		/* */ if (atomic.AddInt32((rw.$ptr_readerCount || (rw.$ptr_readerCount = new ptrType$3(function() { return this.$target.readerCount; }, function($v) { this.$target.readerCount = $v; }, rw))), 1) < 0) { $s = 1; continue; }
		/* */ $s = 2; continue;
		/* if (atomic.AddInt32((rw.$ptr_readerCount || (rw.$ptr_readerCount = new ptrType$3(function() { return this.$target.readerCount; }, function($v) { this.$target.readerCount = $v; }, rw))), 1) < 0) { */ case 1:
			$r = runtime_Semacquire((rw.$ptr_readerSem || (rw.$ptr_readerSem = new ptrType$1(function() { return this.$target.readerSem; }, function($v) { this.$target.readerSem = $v; }, rw)))); /* */ $s = 3; case 3: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
		/* } */ case 2:
		if (false) {
			race.Enable();
			race.Acquire(((rw.$ptr_readerSem || (rw.$ptr_readerSem = new ptrType$1(function() { return this.$target.readerSem; }, function($v) { this.$target.readerSem = $v; }, rw)))));
		}
		$s = -1; return;
		/* */ } return; } if ($f === undefined) { $f = { $blk: RWMutex.ptr.prototype.RLock }; } $f.$ptr = $ptr; $f.rw = rw; $f.$s = $s; $f.$r = $r; return $f;
	};
	RWMutex.prototype.RLock = function() { return this.$val.RLock(); };
	RWMutex.ptr.prototype.RUnlock = function() {
		var $ptr, r, rw, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; $ptr = $f.$ptr; r = $f.r; rw = $f.rw; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		rw = this;
		if (false) {
			$unused(rw.w.state);
			race.ReleaseMerge(((rw.$ptr_writerSem || (rw.$ptr_writerSem = new ptrType$1(function() { return this.$target.writerSem; }, function($v) { this.$target.writerSem = $v; }, rw)))));
			race.Disable();
		}
		r = atomic.AddInt32((rw.$ptr_readerCount || (rw.$ptr_readerCount = new ptrType$3(function() { return this.$target.readerCount; }, function($v) { this.$target.readerCount = $v; }, rw))), -1);
		/* */ if (r < 0) { $s = 1; continue; }
		/* */ $s = 2; continue;
		/* if (r < 0) { */ case 1:
			if (((r + 1 >> 0) === 0) || ((r + 1 >> 0) === -1073741824)) {
				race.Enable();
				throw$1("sync: RUnlock of unlocked RWMutex");
			}
			/* */ if (atomic.AddInt32((rw.$ptr_readerWait || (rw.$ptr_readerWait = new ptrType$3(function() { return this.$target.readerWait; }, function($v) { this.$target.readerWait = $v; }, rw))), -1) === 0) { $s = 3; continue; }
			/* */ $s = 4; continue;
			/* if (atomic.AddInt32((rw.$ptr_readerWait || (rw.$ptr_readerWait = new ptrType$3(function() { return this.$target.readerWait; }, function($v) { this.$target.readerWait = $v; }, rw))), -1) === 0) { */ case 3:
				$r = runtime_Semrelease((rw.$ptr_writerSem || (rw.$ptr_writerSem = new ptrType$1(function() { return this.$target.writerSem; }, function($v) { this.$target.writerSem = $v; }, rw)))); /* */ $s = 5; case 5: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
			/* } */ case 4:
		/* } */ case 2:
		if (false) {
			race.Enable();
		}
		$s = -1; return;
		/* */ } return; } if ($f === undefined) { $f = { $blk: RWMutex.ptr.prototype.RUnlock }; } $f.$ptr = $ptr; $f.r = r; $f.rw = rw; $f.$s = $s; $f.$r = $r; return $f;
	};
	RWMutex.prototype.RUnlock = function() { return this.$val.RUnlock(); };
	RWMutex.ptr.prototype.Lock = function() {
		var $ptr, r, rw, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; $ptr = $f.$ptr; r = $f.r; rw = $f.rw; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		rw = this;
		if (false) {
			$unused(rw.w.state);
			race.Disable();
		}
		$r = rw.w.Lock(); /* */ $s = 1; case 1: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
		r = atomic.AddInt32((rw.$ptr_readerCount || (rw.$ptr_readerCount = new ptrType$3(function() { return this.$target.readerCount; }, function($v) { this.$target.readerCount = $v; }, rw))), -1073741824) + 1073741824 >> 0;
		/* */ if (!((r === 0)) && !((atomic.AddInt32((rw.$ptr_readerWait || (rw.$ptr_readerWait = new ptrType$3(function() { return this.$target.readerWait; }, function($v) { this.$target.readerWait = $v; }, rw))), r) === 0))) { $s = 2; continue; }
		/* */ $s = 3; continue;
		/* if (!((r === 0)) && !((atomic.AddInt32((rw.$ptr_readerWait || (rw.$ptr_readerWait = new ptrType$3(function() { return this.$target.readerWait; }, function($v) { this.$target.readerWait = $v; }, rw))), r) === 0))) { */ case 2:
			$r = runtime_Semacquire((rw.$ptr_writerSem || (rw.$ptr_writerSem = new ptrType$1(function() { return this.$target.writerSem; }, function($v) { this.$target.writerSem = $v; }, rw)))); /* */ $s = 4; case 4: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
		/* } */ case 3:
		if (false) {
			race.Enable();
			race.Acquire(((rw.$ptr_readerSem || (rw.$ptr_readerSem = new ptrType$1(function() { return this.$target.readerSem; }, function($v) { this.$target.readerSem = $v; }, rw)))));
			race.Acquire(((rw.$ptr_writerSem || (rw.$ptr_writerSem = new ptrType$1(function() { return this.$target.writerSem; }, function($v) { this.$target.writerSem = $v; }, rw)))));
		}
		$s = -1; return;
		/* */ } return; } if ($f === undefined) { $f = { $blk: RWMutex.ptr.prototype.Lock }; } $f.$ptr = $ptr; $f.r = r; $f.rw = rw; $f.$s = $s; $f.$r = $r; return $f;
	};
	RWMutex.prototype.Lock = function() { return this.$val.Lock(); };
	RWMutex.ptr.prototype.Unlock = function() {
		var $ptr, i, r, rw, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; $ptr = $f.$ptr; i = $f.i; r = $f.r; rw = $f.rw; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		rw = this;
		if (false) {
			$unused(rw.w.state);
			race.Release(((rw.$ptr_readerSem || (rw.$ptr_readerSem = new ptrType$1(function() { return this.$target.readerSem; }, function($v) { this.$target.readerSem = $v; }, rw)))));
			race.Release(((rw.$ptr_writerSem || (rw.$ptr_writerSem = new ptrType$1(function() { return this.$target.writerSem; }, function($v) { this.$target.writerSem = $v; }, rw)))));
			race.Disable();
		}
		r = atomic.AddInt32((rw.$ptr_readerCount || (rw.$ptr_readerCount = new ptrType$3(function() { return this.$target.readerCount; }, function($v) { this.$target.readerCount = $v; }, rw))), 1073741824);
		if (r >= 1073741824) {
			race.Enable();
			throw$1("sync: Unlock of unlocked RWMutex");
		}
		i = 0;
		/* while (true) { */ case 1:
			/* if (!(i < ((r >> 0)))) { break; } */ if(!(i < ((r >> 0)))) { $s = 2; continue; }
			$r = runtime_Semrelease((rw.$ptr_readerSem || (rw.$ptr_readerSem = new ptrType$1(function() { return this.$target.readerSem; }, function($v) { this.$target.readerSem = $v; }, rw)))); /* */ $s = 3; case 3: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
			i = i + (1) >> 0;
		/* } */ $s = 1; continue; case 2:
		$r = rw.w.Unlock(); /* */ $s = 4; case 4: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
		if (false) {
			race.Enable();
		}
		$s = -1; return;
		/* */ } return; } if ($f === undefined) { $f = { $blk: RWMutex.ptr.prototype.Unlock }; } $f.$ptr = $ptr; $f.i = i; $f.r = r; $f.rw = rw; $f.$s = $s; $f.$r = $r; return $f;
	};
	RWMutex.prototype.Unlock = function() { return this.$val.Unlock(); };
	RWMutex.ptr.prototype.RLocker = function() {
		var $ptr, rw;
		rw = this;
		return ($pointerOfStructConversion(rw, ptrType$7));
	};
	RWMutex.prototype.RLocker = function() { return this.$val.RLocker(); };
	rlocker.ptr.prototype.Lock = function() {
		var $ptr, r, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; $ptr = $f.$ptr; r = $f.r; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		r = this;
		$r = ($pointerOfStructConversion(r, ptrType$8)).RLock(); /* */ $s = 1; case 1: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
		$s = -1; return;
		/* */ } return; } if ($f === undefined) { $f = { $blk: rlocker.ptr.prototype.Lock }; } $f.$ptr = $ptr; $f.r = r; $f.$s = $s; $f.$r = $r; return $f;
	};
	rlocker.prototype.Lock = function() { return this.$val.Lock(); };
	rlocker.ptr.prototype.Unlock = function() {
		var $ptr, r, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; $ptr = $f.$ptr; r = $f.r; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		r = this;
		$r = ($pointerOfStructConversion(r, ptrType$8)).RUnlock(); /* */ $s = 1; case 1: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
		$s = -1; return;
		/* */ } return; } if ($f === undefined) { $f = { $blk: rlocker.ptr.prototype.Unlock }; } $f.$ptr = $ptr; $f.r = r; $f.$s = $s; $f.$r = $r; return $f;
	};
	rlocker.prototype.Unlock = function() { return this.$val.Unlock(); };
	ptrType.methods = [{prop: "Get", name: "Get", pkg: "", typ: $funcType([], [$emptyInterface], false)}, {prop: "Put", name: "Put", pkg: "", typ: $funcType([$emptyInterface], [], false)}, {prop: "getSlow", name: "getSlow", pkg: "sync", typ: $funcType([], [$emptyInterface], false)}, {prop: "pin", name: "pin", pkg: "sync", typ: $funcType([], [ptrType$6], false)}, {prop: "pinSlow", name: "pinSlow", pkg: "sync", typ: $funcType([], [ptrType$6], false)}];
	ptrType$14.methods = [{prop: "Lock", name: "Lock", pkg: "", typ: $funcType([], [], false)}, {prop: "Unlock", name: "Unlock", pkg: "", typ: $funcType([], [], false)}];
	ptrType$8.methods = [{prop: "RLock", name: "RLock", pkg: "", typ: $funcType([], [], false)}, {prop: "RUnlock", name: "RUnlock", pkg: "", typ: $funcType([], [], false)}, {prop: "Lock", name: "Lock", pkg: "", typ: $funcType([], [], false)}, {prop: "Unlock", name: "Unlock", pkg: "", typ: $funcType([], [], false)}, {prop: "RLocker", name: "RLocker", pkg: "", typ: $funcType([], [Locker], false)}];
	ptrType$7.methods = [{prop: "Lock", name: "Lock", pkg: "", typ: $funcType([], [], false)}, {prop: "Unlock", name: "Unlock", pkg: "", typ: $funcType([], [], false)}];
	Pool.init("sync", [{prop: "local", name: "local", exported: false, typ: $UnsafePointer, tag: ""}, {prop: "localSize", name: "localSize", exported: false, typ: $Uintptr, tag: ""}, {prop: "store", name: "store", exported: false, typ: sliceType$4, tag: ""}, {prop: "New", name: "New", exported: true, typ: funcType, tag: ""}]);
	Mutex.init("sync", [{prop: "state", name: "state", exported: false, typ: $Int32, tag: ""}, {prop: "sema", name: "sema", exported: false, typ: $Uint32, tag: ""}]);
	Locker.init([{prop: "Lock", name: "Lock", pkg: "", typ: $funcType([], [], false)}, {prop: "Unlock", name: "Unlock", pkg: "", typ: $funcType([], [], false)}]);
	poolLocal.init("sync", [{prop: "private$0", name: "private", exported: false, typ: $emptyInterface, tag: ""}, {prop: "shared", name: "shared", exported: false, typ: sliceType$4, tag: ""}, {prop: "Mutex", name: "", exported: true, typ: Mutex, tag: ""}, {prop: "pad", name: "pad", exported: false, typ: arrayType$2, tag: ""}]);
	notifyList.init("sync", [{prop: "wait", name: "wait", exported: false, typ: $Uint32, tag: ""}, {prop: "notify", name: "notify", exported: false, typ: $Uint32, tag: ""}, {prop: "lock", name: "lock", exported: false, typ: $Uintptr, tag: ""}, {prop: "head", name: "head", exported: false, typ: $UnsafePointer, tag: ""}, {prop: "tail", name: "tail", exported: false, typ: $UnsafePointer, tag: ""}]);
	RWMutex.init("sync", [{prop: "w", name: "w", exported: false, typ: Mutex, tag: ""}, {prop: "writerSem", name: "writerSem", exported: false, typ: $Uint32, tag: ""}, {prop: "readerSem", name: "readerSem", exported: false, typ: $Uint32, tag: ""}, {prop: "readerCount", name: "readerCount", exported: false, typ: $Int32, tag: ""}, {prop: "readerWait", name: "readerWait", exported: false, typ: $Int32, tag: ""}]);
	rlocker.init("sync", [{prop: "w", name: "w", exported: false, typ: Mutex, tag: ""}, {prop: "writerSem", name: "writerSem", exported: false, typ: $Uint32, tag: ""}, {prop: "readerSem", name: "readerSem", exported: false, typ: $Uint32, tag: ""}, {prop: "readerCount", name: "readerCount", exported: false, typ: $Int32, tag: ""}, {prop: "readerWait", name: "readerWait", exported: false, typ: $Int32, tag: ""}]);
	$init = function() {
		$pkg.$init = function() {};
		/* */ var $f, $c = false, $s = 0, $r; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		$r = race.$init(); /* */ $s = 1; case 1: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
		$r = runtime.$init(); /* */ $s = 2; case 2: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
		$r = atomic.$init(); /* */ $s = 3; case 3: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
		allPools = sliceType.nil;
		semWaiters = {};
		runtime_SemacquireMutex = runtime_Semacquire;
		init();
		init$1();
		/* */ } return; } if ($f === undefined) { $f = { $blk: $init }; } $f.$s = $s; $f.$r = $r; return $f;
	};
	$pkg.$init = $init;
	return $pkg;
})();
$packages["reflect"] = (function() {
	var $pkg = {}, $init, errors, js, math, runtime, strconv, sync, uncommonType, funcType, name, nameData, mapIter, Type, Kind, tflag, rtype, typeAlg, method, ChanDir, arrayType, chanType, imethod, interfaceType, mapType, ptrType, sliceType, structField, structType, Method, nameOff, typeOff, textOff, StructField, StructTag, fieldScan, Value, flag, ValueError, sliceType$1, ptrType$1, sliceType$2, sliceType$3, mapType$1, structType$1, sliceType$5, ptrType$3, funcType$1, sliceType$6, ptrType$4, ptrType$5, sliceType$7, sliceType$8, ptrType$6, ptrType$7, structType$8, sliceType$9, sliceType$10, sliceType$11, sliceType$12, ptrType$8, ptrType$9, sliceType$14, sliceType$15, ptrType$10, sliceType$16, ptrType$16, sliceType$18, ptrType$17, funcType$3, funcType$4, funcType$5, arrayType$12, ptrType$18, initialized, uncommonTypeMap, nameMap, nameOffList, typeOffList, callHelper, jsObjectPtr, selectHelper, kindNames, methodCache, uint8Type, init, jsType, reflectType, setKindType, newName, newNameOff, newTypeOff, internalStr, isWrapped, copyStruct, makeValue, MakeSlice, TypeOf, ValueOf, FuncOf, SliceOf, Zero, unsafe_New, makeInt, typedmemmove, keyFor, mapaccess, mapassign, mapdelete, mapiterinit, mapiterkey, mapiternext, maplen, cvtDirect, methodReceiver, valueInterface, ifaceE2I, methodName, makeMethodValue, wrapJsObject, unwrapJsObject, getJsTag, chanrecv, chansend, PtrTo, implements$1, directlyAssignable, haveIdenticalType, haveIdenticalUnderlyingType, toType, ifaceIndir, overflowFloat32, New, convertOp, makeFloat, makeComplex, makeString, makeBytes, makeRunes, cvtInt, cvtUint, cvtFloatInt, cvtFloatUint, cvtIntFloat, cvtUintFloat, cvtFloat, cvtComplex, cvtIntString, cvtUintString, cvtBytesString, cvtStringBytes, cvtRunesString, cvtStringRunes, cvtT2I, cvtI2I;
	errors = $packages["errors"];
	js = $packages["github.com/gopherjs/gopherjs/js"];
	math = $packages["math"];
	runtime = $packages["runtime"];
	strconv = $packages["strconv"];
	sync = $packages["sync"];
	uncommonType = $pkg.uncommonType = $newType(0, $kindStruct, "reflect.uncommonType", true, "reflect", false, function(pkgPath_, mcount_, _$2_, moff_, _$4_, _methods_) {
		this.$val = this;
		if (arguments.length === 0) {
			this.pkgPath = 0;
			this.mcount = 0;
			this._$2 = 0;
			this.moff = 0;
			this._$4 = 0;
			this._methods = sliceType$3.nil;
			return;
		}
		this.pkgPath = pkgPath_;
		this.mcount = mcount_;
		this._$2 = _$2_;
		this.moff = moff_;
		this._$4 = _$4_;
		this._methods = _methods_;
	});
	funcType = $pkg.funcType = $newType(0, $kindStruct, "reflect.funcType", true, "reflect", false, function(rtype_, inCount_, outCount_, _in_, _out_) {
		this.$val = this;
		if (arguments.length === 0) {
			this.rtype = new rtype.ptr(0, 0, 0, 0, 0, 0, 0, ptrType$4.nil, ptrType$5.nil, 0, 0);
			this.inCount = 0;
			this.outCount = 0;
			this._in = sliceType$2.nil;
			this._out = sliceType$2.nil;
			return;
		}
		this.rtype = rtype_;
		this.inCount = inCount_;
		this.outCount = outCount_;
		this._in = _in_;
		this._out = _out_;
	});
	name = $pkg.name = $newType(0, $kindStruct, "reflect.name", true, "reflect", false, function(bytes_) {
		this.$val = this;
		if (arguments.length === 0) {
			this.bytes = ptrType$5.nil;
			return;
		}
		this.bytes = bytes_;
	});
	nameData = $pkg.nameData = $newType(0, $kindStruct, "reflect.nameData", true, "reflect", false, function(name_, tag_, pkgPath_, exported_) {
		this.$val = this;
		if (arguments.length === 0) {
			this.name = "";
			this.tag = "";
			this.pkgPath = "";
			this.exported = false;
			return;
		}
		this.name = name_;
		this.tag = tag_;
		this.pkgPath = pkgPath_;
		this.exported = exported_;
	});
	mapIter = $pkg.mapIter = $newType(0, $kindStruct, "reflect.mapIter", true, "reflect", false, function(t_, m_, keys_, i_) {
		this.$val = this;
		if (arguments.length === 0) {
			this.t = $ifaceNil;
			this.m = null;
			this.keys = null;
			this.i = 0;
			return;
		}
		this.t = t_;
		this.m = m_;
		this.keys = keys_;
		this.i = i_;
	});
	Type = $pkg.Type = $newType(8, $kindInterface, "reflect.Type", true, "reflect", true, null);
	Kind = $pkg.Kind = $newType(4, $kindUint, "reflect.Kind", true, "reflect", true, null);
	tflag = $pkg.tflag = $newType(1, $kindUint8, "reflect.tflag", true, "reflect", false, null);
	rtype = $pkg.rtype = $newType(0, $kindStruct, "reflect.rtype", true, "reflect", false, function(size_, ptrdata_, hash_, tflag_, align_, fieldAlign_, kind_, alg_, gcdata_, str_, ptrToThis_) {
		this.$val = this;
		if (arguments.length === 0) {
			this.size = 0;
			this.ptrdata = 0;
			this.hash = 0;
			this.tflag = 0;
			this.align = 0;
			this.fieldAlign = 0;
			this.kind = 0;
			this.alg = ptrType$4.nil;
			this.gcdata = ptrType$5.nil;
			this.str = 0;
			this.ptrToThis = 0;
			return;
		}
		this.size = size_;
		this.ptrdata = ptrdata_;
		this.hash = hash_;
		this.tflag = tflag_;
		this.align = align_;
		this.fieldAlign = fieldAlign_;
		this.kind = kind_;
		this.alg = alg_;
		this.gcdata = gcdata_;
		this.str = str_;
		this.ptrToThis = ptrToThis_;
	});
	typeAlg = $pkg.typeAlg = $newType(0, $kindStruct, "reflect.typeAlg", true, "reflect", false, function(hash_, equal_) {
		this.$val = this;
		if (arguments.length === 0) {
			this.hash = $throwNilPointerError;
			this.equal = $throwNilPointerError;
			return;
		}
		this.hash = hash_;
		this.equal = equal_;
	});
	method = $pkg.method = $newType(0, $kindStruct, "reflect.method", true, "reflect", false, function(name_, mtyp_, ifn_, tfn_) {
		this.$val = this;
		if (arguments.length === 0) {
			this.name = 0;
			this.mtyp = 0;
			this.ifn = 0;
			this.tfn = 0;
			return;
		}
		this.name = name_;
		this.mtyp = mtyp_;
		this.ifn = ifn_;
		this.tfn = tfn_;
	});
	ChanDir = $pkg.ChanDir = $newType(4, $kindInt, "reflect.ChanDir", true, "reflect", true, null);
	arrayType = $pkg.arrayType = $newType(0, $kindStruct, "reflect.arrayType", true, "reflect", false, function(rtype_, elem_, slice_, len_) {
		this.$val = this;
		if (arguments.length === 0) {
			this.rtype = new rtype.ptr(0, 0, 0, 0, 0, 0, 0, ptrType$4.nil, ptrType$5.nil, 0, 0);
			this.elem = ptrType$1.nil;
			this.slice = ptrType$1.nil;
			this.len = 0;
			return;
		}
		this.rtype = rtype_;
		this.elem = elem_;
		this.slice = slice_;
		this.len = len_;
	});
	chanType = $pkg.chanType = $newType(0, $kindStruct, "reflect.chanType", true, "reflect", false, function(rtype_, elem_, dir_) {
		this.$val = this;
		if (arguments.length === 0) {
			this.rtype = new rtype.ptr(0, 0, 0, 0, 0, 0, 0, ptrType$4.nil, ptrType$5.nil, 0, 0);
			this.elem = ptrType$1.nil;
			this.dir = 0;
			return;
		}
		this.rtype = rtype_;
		this.elem = elem_;
		this.dir = dir_;
	});
	imethod = $pkg.imethod = $newType(0, $kindStruct, "reflect.imethod", true, "reflect", false, function(name_, typ_) {
		this.$val = this;
		if (arguments.length === 0) {
			this.name = 0;
			this.typ = 0;
			return;
		}
		this.name = name_;
		this.typ = typ_;
	});
	interfaceType = $pkg.interfaceType = $newType(0, $kindStruct, "reflect.interfaceType", true, "reflect", false, function(rtype_, pkgPath_, methods_) {
		this.$val = this;
		if (arguments.length === 0) {
			this.rtype = new rtype.ptr(0, 0, 0, 0, 0, 0, 0, ptrType$4.nil, ptrType$5.nil, 0, 0);
			this.pkgPath = new name.ptr(ptrType$5.nil);
			this.methods = sliceType$7.nil;
			return;
		}
		this.rtype = rtype_;
		this.pkgPath = pkgPath_;
		this.methods = methods_;
	});
	mapType = $pkg.mapType = $newType(0, $kindStruct, "reflect.mapType", true, "reflect", false, function(rtype_, key_, elem_, bucket_, hmap_, keysize_, indirectkey_, valuesize_, indirectvalue_, bucketsize_, reflexivekey_, needkeyupdate_) {
		this.$val = this;
		if (arguments.length === 0) {
			this.rtype = new rtype.ptr(0, 0, 0, 0, 0, 0, 0, ptrType$4.nil, ptrType$5.nil, 0, 0);
			this.key = ptrType$1.nil;
			this.elem = ptrType$1.nil;
			this.bucket = ptrType$1.nil;
			this.hmap = ptrType$1.nil;
			this.keysize = 0;
			this.indirectkey = 0;
			this.valuesize = 0;
			this.indirectvalue = 0;
			this.bucketsize = 0;
			this.reflexivekey = false;
			this.needkeyupdate = false;
			return;
		}
		this.rtype = rtype_;
		this.key = key_;
		this.elem = elem_;
		this.bucket = bucket_;
		this.hmap = hmap_;
		this.keysize = keysize_;
		this.indirectkey = indirectkey_;
		this.valuesize = valuesize_;
		this.indirectvalue = indirectvalue_;
		this.bucketsize = bucketsize_;
		this.reflexivekey = reflexivekey_;
		this.needkeyupdate = needkeyupdate_;
	});
	ptrType = $pkg.ptrType = $newType(0, $kindStruct, "reflect.ptrType", true, "reflect", false, function(rtype_, elem_) {
		this.$val = this;
		if (arguments.length === 0) {
			this.rtype = new rtype.ptr(0, 0, 0, 0, 0, 0, 0, ptrType$4.nil, ptrType$5.nil, 0, 0);
			this.elem = ptrType$1.nil;
			return;
		}
		this.rtype = rtype_;
		this.elem = elem_;
	});
	sliceType = $pkg.sliceType = $newType(0, $kindStruct, "reflect.sliceType", true, "reflect", false, function(rtype_, elem_) {
		this.$val = this;
		if (arguments.length === 0) {
			this.rtype = new rtype.ptr(0, 0, 0, 0, 0, 0, 0, ptrType$4.nil, ptrType$5.nil, 0, 0);
			this.elem = ptrType$1.nil;
			return;
		}
		this.rtype = rtype_;
		this.elem = elem_;
	});
	structField = $pkg.structField = $newType(0, $kindStruct, "reflect.structField", true, "reflect", false, function(name_, typ_, offset_) {
		this.$val = this;
		if (arguments.length === 0) {
			this.name = new name.ptr(ptrType$5.nil);
			this.typ = ptrType$1.nil;
			this.offset = 0;
			return;
		}
		this.name = name_;
		this.typ = typ_;
		this.offset = offset_;
	});
	structType = $pkg.structType = $newType(0, $kindStruct, "reflect.structType", true, "reflect", false, function(rtype_, pkgPath_, fields_) {
		this.$val = this;
		if (arguments.length === 0) {
			this.rtype = new rtype.ptr(0, 0, 0, 0, 0, 0, 0, ptrType$4.nil, ptrType$5.nil, 0, 0);
			this.pkgPath = new name.ptr(ptrType$5.nil);
			this.fields = sliceType$8.nil;
			return;
		}
		this.rtype = rtype_;
		this.pkgPath = pkgPath_;
		this.fields = fields_;
	});
	Method = $pkg.Method = $newType(0, $kindStruct, "reflect.Method", true, "reflect", true, function(Name_, PkgPath_, Type_, Func_, Index_) {
		this.$val = this;
		if (arguments.length === 0) {
			this.Name = "";
			this.PkgPath = "";
			this.Type = $ifaceNil;
			this.Func = new Value.ptr(ptrType$1.nil, 0, 0);
			this.Index = 0;
			return;
		}
		this.Name = Name_;
		this.PkgPath = PkgPath_;
		this.Type = Type_;
		this.Func = Func_;
		this.Index = Index_;
	});
	nameOff = $pkg.nameOff = $newType(4, $kindInt32, "reflect.nameOff", true, "reflect", false, null);
	typeOff = $pkg.typeOff = $newType(4, $kindInt32, "reflect.typeOff", true, "reflect", false, null);
	textOff = $pkg.textOff = $newType(4, $kindInt32, "reflect.textOff", true, "reflect", false, null);
	StructField = $pkg.StructField = $newType(0, $kindStruct, "reflect.StructField", true, "reflect", true, function(Name_, PkgPath_, Type_, Tag_, Offset_, Index_, Anonymous_) {
		this.$val = this;
		if (arguments.length === 0) {
			this.Name = "";
			this.PkgPath = "";
			this.Type = $ifaceNil;
			this.Tag = "";
			this.Offset = 0;
			this.Index = sliceType$14.nil;
			this.Anonymous = false;
			return;
		}
		this.Name = Name_;
		this.PkgPath = PkgPath_;
		this.Type = Type_;
		this.Tag = Tag_;
		this.Offset = Offset_;
		this.Index = Index_;
		this.Anonymous = Anonymous_;
	});
	StructTag = $pkg.StructTag = $newType(8, $kindString, "reflect.StructTag", true, "reflect", true, null);
	fieldScan = $pkg.fieldScan = $newType(0, $kindStruct, "reflect.fieldScan", true, "reflect", false, function(typ_, index_) {
		this.$val = this;
		if (arguments.length === 0) {
			this.typ = ptrType$10.nil;
			this.index = sliceType$14.nil;
			return;
		}
		this.typ = typ_;
		this.index = index_;
	});
	Value = $pkg.Value = $newType(0, $kindStruct, "reflect.Value", true, "reflect", true, function(typ_, ptr_, flag_) {
		this.$val = this;
		if (arguments.length === 0) {
			this.typ = ptrType$1.nil;
			this.ptr = 0;
			this.flag = 0;
			return;
		}
		this.typ = typ_;
		this.ptr = ptr_;
		this.flag = flag_;
	});
	flag = $pkg.flag = $newType(4, $kindUintptr, "reflect.flag", true, "reflect", false, null);
	ValueError = $pkg.ValueError = $newType(0, $kindStruct, "reflect.ValueError", true, "reflect", true, function(Method_, Kind_) {
		this.$val = this;
		if (arguments.length === 0) {
			this.Method = "";
			this.Kind = 0;
			return;
		}
		this.Method = Method_;
		this.Kind = Kind_;
	});
	sliceType$1 = $sliceType(name);
	ptrType$1 = $ptrType(rtype);
	sliceType$2 = $sliceType(ptrType$1);
	sliceType$3 = $sliceType(method);
	mapType$1 = $mapType(ptrType$1, sliceType$3);
	structType$1 = $structType("reflect", [{prop: "RWMutex", name: "", exported: true, typ: sync.RWMutex, tag: ""}, {prop: "m", name: "m", exported: false, typ: mapType$1, tag: ""}]);
	sliceType$5 = $sliceType($emptyInterface);
	ptrType$3 = $ptrType(js.Object);
	funcType$1 = $funcType([sliceType$5], [ptrType$3], true);
	sliceType$6 = $sliceType($String);
	ptrType$4 = $ptrType(typeAlg);
	ptrType$5 = $ptrType($Uint8);
	sliceType$7 = $sliceType(imethod);
	sliceType$8 = $sliceType(structField);
	ptrType$6 = $ptrType(uncommonType);
	ptrType$7 = $ptrType(nameData);
	structType$8 = $structType("reflect", [{prop: "str", name: "str", exported: false, typ: $String, tag: ""}]);
	sliceType$9 = $sliceType(ptrType$3);
	sliceType$10 = $sliceType(Value);
	sliceType$11 = $sliceType(Type);
	sliceType$12 = $sliceType(sliceType$9);
	ptrType$8 = $ptrType(interfaceType);
	ptrType$9 = $ptrType(imethod);
	sliceType$14 = $sliceType($Int);
	sliceType$15 = $sliceType(fieldScan);
	ptrType$10 = $ptrType(structType);
	sliceType$16 = $sliceType($Uint8);
	ptrType$16 = $ptrType($UnsafePointer);
	sliceType$18 = $sliceType($Int32);
	ptrType$17 = $ptrType(funcType);
	funcType$3 = $funcType([$String], [$Bool], false);
	funcType$4 = $funcType([$UnsafePointer, $Uintptr], [$Uintptr], false);
	funcType$5 = $funcType([$UnsafePointer, $UnsafePointer], [$Bool], false);
	arrayType$12 = $arrayType($Uintptr, 2);
	ptrType$18 = $ptrType(ValueError);
	init = function() {
		var $ptr, used, x, x$1, x$10, x$11, x$12, x$2, x$3, x$4, x$5, x$6, x$7, x$8, x$9, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; $ptr = $f.$ptr; used = $f.used; x = $f.x; x$1 = $f.x$1; x$10 = $f.x$10; x$11 = $f.x$11; x$12 = $f.x$12; x$2 = $f.x$2; x$3 = $f.x$3; x$4 = $f.x$4; x$5 = $f.x$5; x$6 = $f.x$6; x$7 = $f.x$7; x$8 = $f.x$8; x$9 = $f.x$9; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		used = (function(i) {
			var $ptr, i;
		});
		$r = used((x = new rtype.ptr(0, 0, 0, 0, 0, 0, 0, ptrType$4.nil, ptrType$5.nil, 0, 0), new x.constructor.elem(x))); /* */ $s = 1; case 1: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
		$r = used((x$1 = new uncommonType.ptr(0, 0, 0, 0, 0, sliceType$3.nil), new x$1.constructor.elem(x$1))); /* */ $s = 2; case 2: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
		$r = used((x$2 = new method.ptr(0, 0, 0, 0), new x$2.constructor.elem(x$2))); /* */ $s = 3; case 3: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
		$r = used((x$3 = new arrayType.ptr(new rtype.ptr(0, 0, 0, 0, 0, 0, 0, ptrType$4.nil, ptrType$5.nil, 0, 0), ptrType$1.nil, ptrType$1.nil, 0), new x$3.constructor.elem(x$3))); /* */ $s = 4; case 4: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
		$r = used((x$4 = new chanType.ptr(new rtype.ptr(0, 0, 0, 0, 0, 0, 0, ptrType$4.nil, ptrType$5.nil, 0, 0), ptrType$1.nil, 0), new x$4.constructor.elem(x$4))); /* */ $s = 5; case 5: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
		$r = used((x$5 = new funcType.ptr(new rtype.ptr(0, 0, 0, 0, 0, 0, 0, ptrType$4.nil, ptrType$5.nil, 0, 0), 0, 0, sliceType$2.nil, sliceType$2.nil), new x$5.constructor.elem(x$5))); /* */ $s = 6; case 6: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
		$r = used((x$6 = new interfaceType.ptr(new rtype.ptr(0, 0, 0, 0, 0, 0, 0, ptrType$4.nil, ptrType$5.nil, 0, 0), new name.ptr(ptrType$5.nil), sliceType$7.nil), new x$6.constructor.elem(x$6))); /* */ $s = 7; case 7: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
		$r = used((x$7 = new mapType.ptr(new rtype.ptr(0, 0, 0, 0, 0, 0, 0, ptrType$4.nil, ptrType$5.nil, 0, 0), ptrType$1.nil, ptrType$1.nil, ptrType$1.nil, ptrType$1.nil, 0, 0, 0, 0, 0, false, false), new x$7.constructor.elem(x$7))); /* */ $s = 8; case 8: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
		$r = used((x$8 = new ptrType.ptr(new rtype.ptr(0, 0, 0, 0, 0, 0, 0, ptrType$4.nil, ptrType$5.nil, 0, 0), ptrType$1.nil), new x$8.constructor.elem(x$8))); /* */ $s = 9; case 9: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
		$r = used((x$9 = new sliceType.ptr(new rtype.ptr(0, 0, 0, 0, 0, 0, 0, ptrType$4.nil, ptrType$5.nil, 0, 0), ptrType$1.nil), new x$9.constructor.elem(x$9))); /* */ $s = 10; case 10: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
		$r = used((x$10 = new structType.ptr(new rtype.ptr(0, 0, 0, 0, 0, 0, 0, ptrType$4.nil, ptrType$5.nil, 0, 0), new name.ptr(ptrType$5.nil), sliceType$8.nil), new x$10.constructor.elem(x$10))); /* */ $s = 11; case 11: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
		$r = used((x$11 = new imethod.ptr(0, 0), new x$11.constructor.elem(x$11))); /* */ $s = 12; case 12: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
		$r = used((x$12 = new structField.ptr(new name.ptr(ptrType$5.nil), ptrType$1.nil, 0), new x$12.constructor.elem(x$12))); /* */ $s = 13; case 13: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
		initialized = true;
		uint8Type = $assertType(TypeOf(new $Uint8(0)), ptrType$1);
		$s = -1; return;
		/* */ } return; } if ($f === undefined) { $f = { $blk: init }; } $f.$ptr = $ptr; $f.used = used; $f.x = x; $f.x$1 = x$1; $f.x$10 = x$10; $f.x$11 = x$11; $f.x$12 = x$12; $f.x$2 = x$2; $f.x$3 = x$3; $f.x$4 = x$4; $f.x$5 = x$5; $f.x$6 = x$6; $f.x$7 = x$7; $f.x$8 = x$8; $f.x$9 = x$9; $f.$s = $s; $f.$r = $r; return $f;
	};
	jsType = function(typ) {
		var $ptr, typ;
		return typ.jsType;
	};
	reflectType = function(typ) {
		var $ptr, _1, _i, _i$1, _i$2, _i$3, _i$4, _key, _ref, _ref$1, _ref$2, _ref$3, _ref$4, dir, f, fields, i, i$1, i$2, i$3, i$4, imethods, in$1, m, m$1, methodSet, methods, out, outCount, params, reflectFields, reflectMethods, results, rt, typ, ut;
		if (typ.reflectType === undefined) {
			rt = new rtype.ptr(((($parseInt(typ.size) >> 0) >>> 0)), 0, 0, 0, 0, 0, ((($parseInt(typ.kind) >> 0) << 24 >>> 24)), ptrType$4.nil, ptrType$5.nil, newNameOff($clone(newName(internalStr(typ.string), "", "", !!(typ.exported)), name)), 0);
			rt.jsType = typ;
			typ.reflectType = rt;
			methodSet = $methodSet(typ);
			if (!(($parseInt(methodSet.length) === 0)) || !!(typ.named)) {
				rt.tflag = (rt.tflag | (1)) >>> 0;
				if (!!(typ.named)) {
					rt.tflag = (rt.tflag | (4)) >>> 0;
				}
				reflectMethods = $makeSlice(sliceType$3, $parseInt(methodSet.length));
				_ref = reflectMethods;
				_i = 0;
				while (true) {
					if (!(_i < _ref.$length)) { break; }
					i = _i;
					m = methodSet[i];
					method.copy(((i < 0 || i >= reflectMethods.$length) ? ($throwRuntimeError("index out of range"), undefined) : reflectMethods.$array[reflectMethods.$offset + i]), new method.ptr(newNameOff($clone(newName(internalStr(m.name), "", "", internalStr(m.pkg) === ""), name)), newTypeOff(reflectType(m.typ)), 0, 0));
					_i++;
				}
				ut = new uncommonType.ptr(newNameOff($clone(newName(internalStr(typ.pkg), "", "", false), name)), (($parseInt(methodSet.length) << 16 >>> 16)), 0, 0, 0, reflectMethods);
				_key = rt; (uncommonTypeMap || $throwRuntimeError("assignment to entry in nil map"))[ptrType$1.keyFor(_key)] = { k: _key, v: ut };
				ut.jsType = typ;
			}
			_1 = rt.Kind();
			if (_1 === (17)) {
				setKindType(rt, new arrayType.ptr(new rtype.ptr(0, 0, 0, 0, 0, 0, 0, ptrType$4.nil, ptrType$5.nil, 0, 0), reflectType(typ.elem), ptrType$1.nil, ((($parseInt(typ.len) >> 0) >>> 0))));
			} else if (_1 === (18)) {
				dir = 3;
				if (!!(typ.sendOnly)) {
					dir = 2;
				}
				if (!!(typ.recvOnly)) {
					dir = 1;
				}
				setKindType(rt, new chanType.ptr(new rtype.ptr(0, 0, 0, 0, 0, 0, 0, ptrType$4.nil, ptrType$5.nil, 0, 0), reflectType(typ.elem), ((dir >>> 0))));
			} else if (_1 === (19)) {
				params = typ.params;
				in$1 = $makeSlice(sliceType$2, $parseInt(params.length));
				_ref$1 = in$1;
				_i$1 = 0;
				while (true) {
					if (!(_i$1 < _ref$1.$length)) { break; }
					i$1 = _i$1;
					((i$1 < 0 || i$1 >= in$1.$length) ? ($throwRuntimeError("index out of range"), undefined) : in$1.$array[in$1.$offset + i$1] = reflectType(params[i$1]));
					_i$1++;
				}
				results = typ.results;
				out = $makeSlice(sliceType$2, $parseInt(results.length));
				_ref$2 = out;
				_i$2 = 0;
				while (true) {
					if (!(_i$2 < _ref$2.$length)) { break; }
					i$2 = _i$2;
					((i$2 < 0 || i$2 >= out.$length) ? ($throwRuntimeError("index out of range"), undefined) : out.$array[out.$offset + i$2] = reflectType(results[i$2]));
					_i$2++;
				}
				outCount = (($parseInt(results.length) << 16 >>> 16));
				if (!!(typ.variadic)) {
					outCount = (outCount | (32768)) >>> 0;
				}
				setKindType(rt, new funcType.ptr($clone(rt, rtype), (($parseInt(params.length) << 16 >>> 16)), outCount, in$1, out));
			} else if (_1 === (20)) {
				methods = typ.methods;
				imethods = $makeSlice(sliceType$7, $parseInt(methods.length));
				_ref$3 = imethods;
				_i$3 = 0;
				while (true) {
					if (!(_i$3 < _ref$3.$length)) { break; }
					i$3 = _i$3;
					m$1 = methods[i$3];
					imethod.copy(((i$3 < 0 || i$3 >= imethods.$length) ? ($throwRuntimeError("index out of range"), undefined) : imethods.$array[imethods.$offset + i$3]), new imethod.ptr(newNameOff($clone(newName(internalStr(m$1.name), "", "", internalStr(m$1.pkg) === ""), name)), newTypeOff(reflectType(m$1.typ))));
					_i$3++;
				}
				setKindType(rt, new interfaceType.ptr($clone(rt, rtype), new name.ptr(ptrType$5.nil), imethods));
			} else if (_1 === (21)) {
				setKindType(rt, new mapType.ptr(new rtype.ptr(0, 0, 0, 0, 0, 0, 0, ptrType$4.nil, ptrType$5.nil, 0, 0), reflectType(typ.key), reflectType(typ.elem), ptrType$1.nil, ptrType$1.nil, 0, 0, 0, 0, 0, false, false));
			} else if (_1 === (22)) {
				setKindType(rt, new ptrType.ptr(new rtype.ptr(0, 0, 0, 0, 0, 0, 0, ptrType$4.nil, ptrType$5.nil, 0, 0), reflectType(typ.elem)));
			} else if (_1 === (23)) {
				setKindType(rt, new sliceType.ptr(new rtype.ptr(0, 0, 0, 0, 0, 0, 0, ptrType$4.nil, ptrType$5.nil, 0, 0), reflectType(typ.elem)));
			} else if (_1 === (25)) {
				fields = typ.fields;
				reflectFields = $makeSlice(sliceType$8, $parseInt(fields.length));
				_ref$4 = reflectFields;
				_i$4 = 0;
				while (true) {
					if (!(_i$4 < _ref$4.$length)) { break; }
					i$4 = _i$4;
					f = fields[i$4];
					structField.copy(((i$4 < 0 || i$4 >= reflectFields.$length) ? ($throwRuntimeError("index out of range"), undefined) : reflectFields.$array[reflectFields.$offset + i$4]), new structField.ptr($clone(newName(internalStr(f.name), internalStr(f.tag), "", !!(f.exported)), name), reflectType(f.typ), ((i$4 >>> 0))));
					_i$4++;
				}
				setKindType(rt, new structType.ptr($clone(rt, rtype), $clone(newName(internalStr(typ.pkgPath), "", "", false), name), reflectFields));
			}
		}
		return ((typ.reflectType));
	};
	setKindType = function(rt, kindType) {
		var $ptr, kindType, rt;
		rt.kindType = kindType;
		kindType.rtype = rt;
	};
	uncommonType.ptr.prototype.methods = function() {
		var $ptr, t;
		t = this;
		return t._methods;
	};
	uncommonType.prototype.methods = function() { return this.$val.methods(); };
	rtype.ptr.prototype.uncommon = function() {
		var $ptr, _entry, t;
		t = this;
		return (_entry = uncommonTypeMap[ptrType$1.keyFor(t)], _entry !== undefined ? _entry.v : ptrType$6.nil);
	};
	rtype.prototype.uncommon = function() { return this.$val.uncommon(); };
	funcType.ptr.prototype.in$ = function() {
		var $ptr, t;
		t = this;
		return t._in;
	};
	funcType.prototype.in$ = function() { return this.$val.in$(); };
	funcType.ptr.prototype.out = function() {
		var $ptr, t;
		t = this;
		return t._out;
	};
	funcType.prototype.out = function() { return this.$val.out(); };
	name.ptr.prototype.name = function() {
		var $ptr, _entry, n, s;
		s = "";
		n = this;
		s = (_entry = nameMap[ptrType$5.keyFor(n.bytes)], _entry !== undefined ? _entry.v : ptrType$7.nil).name;
		return s;
	};
	name.prototype.name = function() { return this.$val.name(); };
	name.ptr.prototype.tag = function() {
		var $ptr, _entry, n, s;
		s = "";
		n = this;
		s = (_entry = nameMap[ptrType$5.keyFor(n.bytes)], _entry !== undefined ? _entry.v : ptrType$7.nil).tag;
		return s;
	};
	name.prototype.tag = function() { return this.$val.tag(); };
	name.ptr.prototype.pkgPath = function() {
		var $ptr, _entry, n;
		n = this;
		return (_entry = nameMap[ptrType$5.keyFor(n.bytes)], _entry !== undefined ? _entry.v : ptrType$7.nil).pkgPath;
	};
	name.prototype.pkgPath = function() { return this.$val.pkgPath(); };
	name.ptr.prototype.isExported = function() {
		var $ptr, _entry, n;
		n = this;
		return (_entry = nameMap[ptrType$5.keyFor(n.bytes)], _entry !== undefined ? _entry.v : ptrType$7.nil).exported;
	};
	name.prototype.isExported = function() { return this.$val.isExported(); };
	newName = function(n, tag, pkgPath, exported) {
		var $ptr, _key, b, exported, n, pkgPath, tag;
		b = $newDataPointer(0, ptrType$5);
		_key = b; (nameMap || $throwRuntimeError("assignment to entry in nil map"))[ptrType$5.keyFor(_key)] = { k: _key, v: new nameData.ptr(n, tag, pkgPath, exported) };
		return new name.ptr(b);
	};
	rtype.ptr.prototype.nameOff = function(off) {
		var $ptr, off, t, x;
		t = this;
		return (x = ((off >> 0)), ((x < 0 || x >= nameOffList.$length) ? ($throwRuntimeError("index out of range"), undefined) : nameOffList.$array[nameOffList.$offset + x]));
	};
	rtype.prototype.nameOff = function(off) { return this.$val.nameOff(off); };
	newNameOff = function(n) {
		var $ptr, i, n;
		i = nameOffList.$length;
		nameOffList = $append(nameOffList, n);
		return ((i >> 0));
	};
	rtype.ptr.prototype.typeOff = function(off) {
		var $ptr, off, t, x;
		t = this;
		return (x = ((off >> 0)), ((x < 0 || x >= typeOffList.$length) ? ($throwRuntimeError("index out of range"), undefined) : typeOffList.$array[typeOffList.$offset + x]));
	};
	rtype.prototype.typeOff = function(off) { return this.$val.typeOff(off); };
	newTypeOff = function(t) {
		var $ptr, i, t;
		i = typeOffList.$length;
		typeOffList = $append(typeOffList, t);
		return ((i >> 0));
	};
	internalStr = function(strObj) {
		var $ptr, c, strObj;
		c = new structType$8.ptr("");
		c.str = strObj;
		return c.str;
	};
	isWrapped = function(typ) {
		var $ptr, typ;
		return !!(jsType(typ).wrapped);
	};
	copyStruct = function(dst, src, typ) {
		var $ptr, dst, fields, i, prop, src, typ;
		fields = jsType(typ).fields;
		i = 0;
		while (true) {
			if (!(i < $parseInt(fields.length))) { break; }
			prop = $internalize(fields[i].prop, $String);
			dst[$externalize(prop, $String)] = src[$externalize(prop, $String)];
			i = i + (1) >> 0;
		}
	};
	makeValue = function(t, v, fl) {
		var $ptr, _r, _r$1, _r$2, _r$3, _r$4, _r$5, _v, _v$1, fl, rt, t, v, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; $ptr = $f.$ptr; _r = $f._r; _r$1 = $f._r$1; _r$2 = $f._r$2; _r$3 = $f._r$3; _r$4 = $f._r$4; _r$5 = $f._r$5; _v = $f._v; _v$1 = $f._v$1; fl = $f.fl; rt = $f.rt; t = $f.t; v = $f.v; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		_r = t.common(); /* */ $s = 1; case 1: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
		rt = _r;
		_r$1 = t.Kind(); /* */ $s = 6; case 6: if($c) { $c = false; _r$1 = _r$1.$blk(); } if (_r$1 && _r$1.$blk !== undefined) { break s; }
		if (_r$1 === 17) { _v$1 = true; $s = 5; continue s; }
		_r$2 = t.Kind(); /* */ $s = 7; case 7: if($c) { $c = false; _r$2 = _r$2.$blk(); } if (_r$2 && _r$2.$blk !== undefined) { break s; }
		_v$1 = _r$2 === 25; case 5:
		if (_v$1) { _v = true; $s = 4; continue s; }
		_r$3 = t.Kind(); /* */ $s = 8; case 8: if($c) { $c = false; _r$3 = _r$3.$blk(); } if (_r$3 && _r$3.$blk !== undefined) { break s; }
		_v = _r$3 === 22; case 4:
		/* */ if (_v) { $s = 2; continue; }
		/* */ $s = 3; continue;
		/* if (_v) { */ case 2:
			_r$4 = t.Kind(); /* */ $s = 9; case 9: if($c) { $c = false; _r$4 = _r$4.$blk(); } if (_r$4 && _r$4.$blk !== undefined) { break s; }
			$s = -1; return new Value.ptr(rt, (v), (fl | ((_r$4 >>> 0))) >>> 0);
		/* } */ case 3:
		_r$5 = t.Kind(); /* */ $s = 10; case 10: if($c) { $c = false; _r$5 = _r$5.$blk(); } if (_r$5 && _r$5.$blk !== undefined) { break s; }
		$s = -1; return new Value.ptr(rt, ($newDataPointer(v, jsType(rt.ptrTo()))), (((fl | ((_r$5 >>> 0))) >>> 0) | 128) >>> 0);
		/* */ } return; } if ($f === undefined) { $f = { $blk: makeValue }; } $f.$ptr = $ptr; $f._r = _r; $f._r$1 = _r$1; $f._r$2 = _r$2; $f._r$3 = _r$3; $f._r$4 = _r$4; $f._r$5 = _r$5; $f._v = _v; $f._v$1 = _v$1; $f.fl = fl; $f.rt = rt; $f.t = t; $f.v = v; $f.$s = $s; $f.$r = $r; return $f;
	};
	MakeSlice = function(typ, len, cap) {
		var $ptr, _r, _r$1, cap, len, typ, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; $ptr = $f.$ptr; _r = $f._r; _r$1 = $f._r$1; cap = $f.cap; len = $f.len; typ = $f.typ; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		typ = [typ];
		_r = typ[0].Kind(); /* */ $s = 3; case 3: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
		/* */ if (!((_r === 23))) { $s = 1; continue; }
		/* */ $s = 2; continue;
		/* if (!((_r === 23))) { */ case 1:
			$panic(new $String("reflect.MakeSlice of non-slice type"));
		/* } */ case 2:
		if (len < 0) {
			$panic(new $String("reflect.MakeSlice: negative len"));
		}
		if (cap < 0) {
			$panic(new $String("reflect.MakeSlice: negative cap"));
		}
		if (len > cap) {
			$panic(new $String("reflect.MakeSlice: len > cap"));
		}
		_r$1 = makeValue(typ[0], $makeSlice(jsType(typ[0]), len, cap, (function(typ) { return function $b() {
			var $ptr, _r$1, _r$2, $s, $r;
			/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; $ptr = $f.$ptr; _r$1 = $f._r$1; _r$2 = $f._r$2; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
			_r$1 = typ[0].Elem(); /* */ $s = 1; case 1: if($c) { $c = false; _r$1 = _r$1.$blk(); } if (_r$1 && _r$1.$blk !== undefined) { break s; }
			_r$2 = jsType(_r$1); /* */ $s = 2; case 2: if($c) { $c = false; _r$2 = _r$2.$blk(); } if (_r$2 && _r$2.$blk !== undefined) { break s; }
			$s = -1; return _r$2.zero();
			/* */ } return; } if ($f === undefined) { $f = { $blk: $b }; } $f.$ptr = $ptr; $f._r$1 = _r$1; $f._r$2 = _r$2; $f.$s = $s; $f.$r = $r; return $f;
		}; })(typ)), 0); /* */ $s = 4; case 4: if($c) { $c = false; _r$1 = _r$1.$blk(); } if (_r$1 && _r$1.$blk !== undefined) { break s; }
		$s = -1; return _r$1;
		/* */ } return; } if ($f === undefined) { $f = { $blk: MakeSlice }; } $f.$ptr = $ptr; $f._r = _r; $f._r$1 = _r$1; $f.cap = cap; $f.len = len; $f.typ = typ; $f.$s = $s; $f.$r = $r; return $f;
	};
	$pkg.MakeSlice = MakeSlice;
	TypeOf = function(i) {
		var $ptr, i;
		if (!initialized) {
			return new rtype.ptr(0, 0, 0, 0, 0, 0, 0, ptrType$4.nil, ptrType$5.nil, 0, 0);
		}
		if ($interfaceIsEqual(i, $ifaceNil)) {
			return $ifaceNil;
		}
		return reflectType(i.constructor);
	};
	$pkg.TypeOf = TypeOf;
	ValueOf = function(i) {
		var $ptr, _r, i, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; $ptr = $f.$ptr; _r = $f._r; i = $f.i; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		if ($interfaceIsEqual(i, $ifaceNil)) {
			$s = -1; return new Value.ptr(ptrType$1.nil, 0, 0);
		}
		_r = makeValue(reflectType(i.constructor), i.$val, 0); /* */ $s = 1; case 1: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
		$s = -1; return _r;
		/* */ } return; } if ($f === undefined) { $f = { $blk: ValueOf }; } $f.$ptr = $ptr; $f._r = _r; $f.i = i; $f.$s = $s; $f.$r = $r; return $f;
	};
	$pkg.ValueOf = ValueOf;
	FuncOf = function(in$1, out, variadic) {
		var $ptr, _i, _i$1, _r, _ref, _ref$1, _v, _v$1, i, i$1, in$1, jsIn, jsOut, out, v, v$1, variadic, x, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; $ptr = $f.$ptr; _i = $f._i; _i$1 = $f._i$1; _r = $f._r; _ref = $f._ref; _ref$1 = $f._ref$1; _v = $f._v; _v$1 = $f._v$1; i = $f.i; i$1 = $f.i$1; in$1 = $f.in$1; jsIn = $f.jsIn; jsOut = $f.jsOut; out = $f.out; v = $f.v; v$1 = $f.v$1; variadic = $f.variadic; x = $f.x; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		if (!(variadic)) { _v = false; $s = 3; continue s; }
		if (in$1.$length === 0) { _v$1 = true; $s = 4; continue s; }
		_r = (x = in$1.$length - 1 >> 0, ((x < 0 || x >= in$1.$length) ? ($throwRuntimeError("index out of range"), undefined) : in$1.$array[in$1.$offset + x])).Kind(); /* */ $s = 5; case 5: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
		_v$1 = !((_r === 23)); case 4:
		_v = _v$1; case 3:
		/* */ if (_v) { $s = 1; continue; }
		/* */ $s = 2; continue;
		/* if (_v) { */ case 1:
			$panic(new $String("reflect.FuncOf: last arg of variadic func must be slice"));
		/* } */ case 2:
		jsIn = $makeSlice(sliceType$9, in$1.$length);
		_ref = in$1;
		_i = 0;
		while (true) {
			if (!(_i < _ref.$length)) { break; }
			i = _i;
			v = ((_i < 0 || _i >= _ref.$length) ? ($throwRuntimeError("index out of range"), undefined) : _ref.$array[_ref.$offset + _i]);
			((i < 0 || i >= jsIn.$length) ? ($throwRuntimeError("index out of range"), undefined) : jsIn.$array[jsIn.$offset + i] = jsType(v));
			_i++;
		}
		jsOut = $makeSlice(sliceType$9, out.$length);
		_ref$1 = out;
		_i$1 = 0;
		while (true) {
			if (!(_i$1 < _ref$1.$length)) { break; }
			i$1 = _i$1;
			v$1 = ((_i$1 < 0 || _i$1 >= _ref$1.$length) ? ($throwRuntimeError("index out of range"), undefined) : _ref$1.$array[_ref$1.$offset + _i$1]);
			((i$1 < 0 || i$1 >= jsOut.$length) ? ($throwRuntimeError("index out of range"), undefined) : jsOut.$array[jsOut.$offset + i$1] = jsType(v$1));
			_i$1++;
		}
		$s = -1; return reflectType($funcType($externalize(jsIn, sliceType$9), $externalize(jsOut, sliceType$9), $externalize(variadic, $Bool)));
		/* */ } return; } if ($f === undefined) { $f = { $blk: FuncOf }; } $f.$ptr = $ptr; $f._i = _i; $f._i$1 = _i$1; $f._r = _r; $f._ref = _ref; $f._ref$1 = _ref$1; $f._v = _v; $f._v$1 = _v$1; $f.i = i; $f.i$1 = i$1; $f.in$1 = in$1; $f.jsIn = jsIn; $f.jsOut = jsOut; $f.out = out; $f.v = v; $f.v$1 = v$1; $f.variadic = variadic; $f.x = x; $f.$s = $s; $f.$r = $r; return $f;
	};
	$pkg.FuncOf = FuncOf;
	rtype.ptr.prototype.ptrTo = function() {
		var $ptr, t;
		t = this;
		return reflectType($ptrType(jsType(t)));
	};
	rtype.prototype.ptrTo = function() { return this.$val.ptrTo(); };
	SliceOf = function(t) {
		var $ptr, t;
		return reflectType($sliceType(jsType(t)));
	};
	$pkg.SliceOf = SliceOf;
	Zero = function(typ) {
		var $ptr, _r, typ, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; $ptr = $f.$ptr; _r = $f._r; typ = $f.typ; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		_r = makeValue(typ, jsType(typ).zero(), 0); /* */ $s = 1; case 1: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
		$s = -1; return _r;
		/* */ } return; } if ($f === undefined) { $f = { $blk: Zero }; } $f.$ptr = $ptr; $f._r = _r; $f.typ = typ; $f.$s = $s; $f.$r = $r; return $f;
	};
	$pkg.Zero = Zero;
	unsafe_New = function(typ) {
		var $ptr, _1, typ;
		_1 = typ.Kind();
		if (_1 === (25)) {
			return (new (jsType(typ).ptr)());
		} else if (_1 === (17)) {
			return (jsType(typ).zero());
		} else {
			return ($newDataPointer(jsType(typ).zero(), jsType(typ.ptrTo())));
		}
	};
	makeInt = function(f, bits, t) {
		var $ptr, _1, _r, bits, f, ptr, t, typ, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; $ptr = $f.$ptr; _1 = $f._1; _r = $f._r; bits = $f.bits; f = $f.f; ptr = $f.ptr; t = $f.t; typ = $f.typ; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		_r = t.common(); /* */ $s = 1; case 1: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
		typ = _r;
		ptr = unsafe_New(typ);
		_1 = typ.Kind();
		if (_1 === (3)) {
			(ptr).$set(((bits.$low << 24 >> 24)));
		} else if (_1 === (4)) {
			(ptr).$set(((bits.$low << 16 >> 16)));
		} else if ((_1 === (2)) || (_1 === (5))) {
			(ptr).$set(((bits.$low >> 0)));
		} else if (_1 === (6)) {
			(ptr).$set((new $Int64(bits.$high, bits.$low)));
		} else if (_1 === (8)) {
			(ptr).$set(((bits.$low << 24 >>> 24)));
		} else if (_1 === (9)) {
			(ptr).$set(((bits.$low << 16 >>> 16)));
		} else if ((_1 === (7)) || (_1 === (10)) || (_1 === (12))) {
			(ptr).$set(((bits.$low >>> 0)));
		} else if (_1 === (11)) {
			(ptr).$set((bits));
		}
		$s = -1; return new Value.ptr(typ, ptr, (((f | 128) >>> 0) | ((typ.Kind() >>> 0))) >>> 0);
		/* */ } return; } if ($f === undefined) { $f = { $blk: makeInt }; } $f.$ptr = $ptr; $f._1 = _1; $f._r = _r; $f.bits = bits; $f.f = f; $f.ptr = ptr; $f.t = t; $f.typ = typ; $f.$s = $s; $f.$r = $r; return $f;
	};
	typedmemmove = function(t, dst, src) {
		var $ptr, dst, src, t;
		dst.$set(src.$get());
	};
	keyFor = function(t, key) {
		var $ptr, k, key, kv, t;
		kv = key;
		if (!(kv.$get === undefined)) {
			kv = kv.$get();
		}
		k = $internalize(jsType(t.Key()).keyFor(kv), $String);
		return [kv, k];
	};
	mapaccess = function(t, m, key) {
		var $ptr, _tuple, entry, k, key, m, t;
		_tuple = keyFor(t, key);
		k = _tuple[1];
		entry = m[$externalize(k, $String)];
		if (entry === undefined) {
			return 0;
		}
		return ($newDataPointer(entry.v, jsType(PtrTo(t.Elem()))));
	};
	mapassign = function(t, m, key, val) {
		var $ptr, _r, _tuple, entry, et, jsVal, k, key, kv, m, newVal, t, val, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; $ptr = $f.$ptr; _r = $f._r; _tuple = $f._tuple; entry = $f.entry; et = $f.et; jsVal = $f.jsVal; k = $f.k; key = $f.key; kv = $f.kv; m = $f.m; newVal = $f.newVal; t = $f.t; val = $f.val; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		_tuple = keyFor(t, key);
		kv = _tuple[0];
		k = _tuple[1];
		jsVal = val.$get();
		et = t.Elem();
		_r = et.Kind(); /* */ $s = 3; case 3: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
		/* */ if (_r === 25) { $s = 1; continue; }
		/* */ $s = 2; continue;
		/* if (_r === 25) { */ case 1:
			newVal = jsType(et).zero();
			copyStruct(newVal, jsVal, et);
			jsVal = newVal;
		/* } */ case 2:
		entry = new ($global.Object)();
		entry.k = kv;
		entry.v = jsVal;
		m[$externalize(k, $String)] = entry;
		$s = -1; return;
		/* */ } return; } if ($f === undefined) { $f = { $blk: mapassign }; } $f.$ptr = $ptr; $f._r = _r; $f._tuple = _tuple; $f.entry = entry; $f.et = et; $f.jsVal = jsVal; $f.k = k; $f.key = key; $f.kv = kv; $f.m = m; $f.newVal = newVal; $f.t = t; $f.val = val; $f.$s = $s; $f.$r = $r; return $f;
	};
	mapdelete = function(t, m, key) {
		var $ptr, _tuple, k, key, m, t;
		_tuple = keyFor(t, key);
		k = _tuple[1];
		delete m[$externalize(k, $String)];
	};
	mapiterinit = function(t, m) {
		var $ptr, m, t;
		return ((new mapIter.ptr(t, m, $keys(m), 0)));
	};
	mapiterkey = function(it) {
		var $ptr, _r, _r$1, _r$2, it, iter, k, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; $ptr = $f.$ptr; _r = $f._r; _r$1 = $f._r$1; _r$2 = $f._r$2; it = $f.it; iter = $f.iter; k = $f.k; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		iter = ((it));
		k = iter.keys[iter.i];
		_r = iter.t.Key(); /* */ $s = 1; case 1: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
		_r$1 = PtrTo(_r); /* */ $s = 2; case 2: if($c) { $c = false; _r$1 = _r$1.$blk(); } if (_r$1 && _r$1.$blk !== undefined) { break s; }
		_r$2 = jsType(_r$1); /* */ $s = 3; case 3: if($c) { $c = false; _r$2 = _r$2.$blk(); } if (_r$2 && _r$2.$blk !== undefined) { break s; }
		$s = -1; return ($newDataPointer(iter.m[$externalize($internalize(k, $String), $String)].k, _r$2));
		/* */ } return; } if ($f === undefined) { $f = { $blk: mapiterkey }; } $f.$ptr = $ptr; $f._r = _r; $f._r$1 = _r$1; $f._r$2 = _r$2; $f.it = it; $f.iter = iter; $f.k = k; $f.$s = $s; $f.$r = $r; return $f;
	};
	mapiternext = function(it) {
		var $ptr, it, iter;
		iter = ((it));
		iter.i = iter.i + (1) >> 0;
	};
	maplen = function(m) {
		var $ptr, m;
		return $parseInt($keys(m).length);
	};
	cvtDirect = function(v, typ) {
		var $ptr, _1, _arg, _arg$1, _arg$2, _r, _r$1, _r$2, _r$3, _r$4, _r$5, _r$6, _r$7, k, slice, srcVal, typ, v, val, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; $ptr = $f.$ptr; _1 = $f._1; _arg = $f._arg; _arg$1 = $f._arg$1; _arg$2 = $f._arg$2; _r = $f._r; _r$1 = $f._r$1; _r$2 = $f._r$2; _r$3 = $f._r$3; _r$4 = $f._r$4; _r$5 = $f._r$5; _r$6 = $f._r$6; _r$7 = $f._r$7; k = $f.k; slice = $f.slice; srcVal = $f.srcVal; typ = $f.typ; v = $f.v; val = $f.val; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		srcVal = $clone(v, Value).object();
		/* */ if (srcVal === jsType(v.typ).nil) { $s = 1; continue; }
		/* */ $s = 2; continue;
		/* if (srcVal === jsType(v.typ).nil) { */ case 1:
			_r = makeValue(typ, jsType(typ).nil, v.flag); /* */ $s = 3; case 3: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
			$s = -1; return _r;
		/* } */ case 2:
		val = null;
			_r$1 = typ.Kind(); /* */ $s = 5; case 5: if($c) { $c = false; _r$1 = _r$1.$blk(); } if (_r$1 && _r$1.$blk !== undefined) { break s; }
			k = _r$1;
			_1 = k;
			/* */ if (_1 === (23)) { $s = 6; continue; }
			/* */ if (_1 === (22)) { $s = 7; continue; }
			/* */ if (_1 === (25)) { $s = 8; continue; }
			/* */ if ((_1 === (17)) || (_1 === (1)) || (_1 === (18)) || (_1 === (19)) || (_1 === (20)) || (_1 === (21)) || (_1 === (24))) { $s = 9; continue; }
			/* */ $s = 10; continue;
			/* if (_1 === (23)) { */ case 6:
				slice = new (jsType(typ))(srcVal.$array);
				slice.$offset = srcVal.$offset;
				slice.$length = srcVal.$length;
				slice.$capacity = srcVal.$capacity;
				val = $newDataPointer(slice, jsType(PtrTo(typ)));
				$s = 11; continue;
			/* } else if (_1 === (22)) { */ case 7:
				_r$2 = typ.Elem(); /* */ $s = 14; case 14: if($c) { $c = false; _r$2 = _r$2.$blk(); } if (_r$2 && _r$2.$blk !== undefined) { break s; }
				_r$3 = _r$2.Kind(); /* */ $s = 15; case 15: if($c) { $c = false; _r$3 = _r$3.$blk(); } if (_r$3 && _r$3.$blk !== undefined) { break s; }
				/* */ if (_r$3 === 25) { $s = 12; continue; }
				/* */ $s = 13; continue;
				/* if (_r$3 === 25) { */ case 12:
					_r$4 = typ.Elem(); /* */ $s = 18; case 18: if($c) { $c = false; _r$4 = _r$4.$blk(); } if (_r$4 && _r$4.$blk !== undefined) { break s; }
					/* */ if ($interfaceIsEqual(_r$4, v.typ.Elem())) { $s = 16; continue; }
					/* */ $s = 17; continue;
					/* if ($interfaceIsEqual(_r$4, v.typ.Elem())) { */ case 16:
						val = srcVal;
						/* break; */ $s = 4; continue;
					/* } */ case 17:
					val = new (jsType(typ))();
					_arg = val;
					_arg$1 = srcVal;
					_r$5 = typ.Elem(); /* */ $s = 19; case 19: if($c) { $c = false; _r$5 = _r$5.$blk(); } if (_r$5 && _r$5.$blk !== undefined) { break s; }
					_arg$2 = _r$5;
					$r = copyStruct(_arg, _arg$1, _arg$2); /* */ $s = 20; case 20: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
					/* break; */ $s = 4; continue;
				/* } */ case 13:
				val = new (jsType(typ))(srcVal.$get, srcVal.$set);
				$s = 11; continue;
			/* } else if (_1 === (25)) { */ case 8:
				val = new (jsType(typ).ptr)();
				copyStruct(val, srcVal, typ);
				$s = 11; continue;
			/* } else if ((_1 === (17)) || (_1 === (1)) || (_1 === (18)) || (_1 === (19)) || (_1 === (20)) || (_1 === (21)) || (_1 === (24))) { */ case 9:
				val = v.ptr;
				$s = 11; continue;
			/* } else { */ case 10:
				$panic(new ValueError.ptr("reflect.Convert", k));
			/* } */ case 11:
		case 4:
		_r$6 = typ.common(); /* */ $s = 21; case 21: if($c) { $c = false; _r$6 = _r$6.$blk(); } if (_r$6 && _r$6.$blk !== undefined) { break s; }
		_r$7 = typ.Kind(); /* */ $s = 22; case 22: if($c) { $c = false; _r$7 = _r$7.$blk(); } if (_r$7 && _r$7.$blk !== undefined) { break s; }
		$s = -1; return new Value.ptr(_r$6, (val), (((v.flag & 224) >>> 0) | ((_r$7 >>> 0))) >>> 0);
		/* */ } return; } if ($f === undefined) { $f = { $blk: cvtDirect }; } $f.$ptr = $ptr; $f._1 = _1; $f._arg = _arg; $f._arg$1 = _arg$1; $f._arg$2 = _arg$2; $f._r = _r; $f._r$1 = _r$1; $f._r$2 = _r$2; $f._r$3 = _r$3; $f._r$4 = _r$4; $f._r$5 = _r$5; $f._r$6 = _r$6; $f._r$7 = _r$7; $f.k = k; $f.slice = slice; $f.srcVal = srcVal; $f.typ = typ; $f.v = v; $f.val = val; $f.$s = $s; $f.$r = $r; return $f;
	};
	methodReceiver = function(op, v, i) {
		var $ptr, _$38, fn, i, m, m$1, op, prop, rcvr, t, tt, ut, v, x, x$1;
		_$38 = ptrType$1.nil;
		t = ptrType$1.nil;
		fn = 0;
		prop = "";
		if (v.typ.Kind() === 20) {
			tt = (v.typ.kindType);
			if (i < 0 || i >= tt.methods.$length) {
				$panic(new $String("reflect: internal error: invalid method index"));
			}
			m = (x = tt.methods, ((i < 0 || i >= x.$length) ? ($throwRuntimeError("index out of range"), undefined) : x.$array[x.$offset + i]));
			if (!$clone(tt.rtype.nameOff(m.name), name).isExported()) {
				$panic(new $String("reflect: " + op + " of unexported method"));
			}
			t = tt.rtype.typeOff(m.typ);
			prop = $clone(tt.rtype.nameOff(m.name), name).name();
		} else {
			ut = v.typ.uncommon();
			if (ut === ptrType$6.nil || ((i >>> 0)) >= ((ut.mcount >>> 0))) {
				$panic(new $String("reflect: internal error: invalid method index"));
			}
			m$1 = $clone((x$1 = ut.methods(), ((i < 0 || i >= x$1.$length) ? ($throwRuntimeError("index out of range"), undefined) : x$1.$array[x$1.$offset + i])), method);
			if (!$clone(v.typ.nameOff(m$1.name), name).isExported()) {
				$panic(new $String("reflect: " + op + " of unexported method"));
			}
			t = v.typ.typeOff(m$1.mtyp);
			prop = $internalize($methodSet(jsType(v.typ))[i].prop, $String);
		}
		rcvr = $clone(v, Value).object();
		if (isWrapped(v.typ)) {
			rcvr = new (jsType(v.typ))(rcvr);
		}
		fn = (rcvr[$externalize(prop, $String)]);
		return [_$38, t, fn];
	};
	valueInterface = function(v, safe) {
		var $ptr, _r, safe, v, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; $ptr = $f.$ptr; _r = $f._r; safe = $f.safe; v = $f.v; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		if (v.flag === 0) {
			$panic(new ValueError.ptr("reflect.Value.Interface", 0));
		}
		if (safe && !((((v.flag & 96) >>> 0) === 0))) {
			$panic(new $String("reflect.Value.Interface: cannot return value obtained from unexported field or method"));
		}
		/* */ if (!((((v.flag & 512) >>> 0) === 0))) { $s = 1; continue; }
		/* */ $s = 2; continue;
		/* if (!((((v.flag & 512) >>> 0) === 0))) { */ case 1:
			_r = makeMethodValue("Interface", $clone(v, Value)); /* */ $s = 3; case 3: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
			v = _r;
		/* } */ case 2:
		if (isWrapped(v.typ)) {
			$s = -1; return ((new (jsType(v.typ))($clone(v, Value).object())));
		}
		$s = -1; return (($clone(v, Value).object()));
		/* */ } return; } if ($f === undefined) { $f = { $blk: valueInterface }; } $f.$ptr = $ptr; $f._r = _r; $f.safe = safe; $f.v = v; $f.$s = $s; $f.$r = $r; return $f;
	};
	ifaceE2I = function(t, src, dst) {
		var $ptr, dst, src, t;
		dst.$set(src);
	};
	methodName = function() {
		var $ptr;
		return "?FIXME?";
	};
	makeMethodValue = function(op, v) {
		var $ptr, _r, _tuple, fn, fv, op, rcvr, v, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; $ptr = $f.$ptr; _r = $f._r; _tuple = $f._tuple; fn = $f.fn; fv = $f.fv; op = $f.op; rcvr = $f.rcvr; v = $f.v; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		fn = [fn];
		rcvr = [rcvr];
		if (((v.flag & 512) >>> 0) === 0) {
			$panic(new $String("reflect: internal error: invalid use of makePartialFunc"));
		}
		_tuple = methodReceiver(op, $clone(v, Value), ((v.flag >> 0)) >> 10 >> 0);
		fn[0] = _tuple[2];
		rcvr[0] = $clone(v, Value).object();
		if (isWrapped(v.typ)) {
			rcvr[0] = new (jsType(v.typ))(rcvr[0]);
		}
		fv = js.MakeFunc((function(fn, rcvr) { return function(this$1, arguments$1) {
			var $ptr, arguments$1, this$1;
			return new $jsObjectPtr(fn[0].apply(rcvr[0], $externalize(arguments$1, sliceType$9)));
		}; })(fn, rcvr));
		_r = $clone(v, Value).Type().common(); /* */ $s = 1; case 1: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
		$s = -1; return new Value.ptr(_r, (fv), (((v.flag & 96) >>> 0) | 19) >>> 0);
		/* */ } return; } if ($f === undefined) { $f = { $blk: makeMethodValue }; } $f.$ptr = $ptr; $f._r = _r; $f._tuple = _tuple; $f.fn = fn; $f.fv = fv; $f.op = op; $f.rcvr = rcvr; $f.v = v; $f.$s = $s; $f.$r = $r; return $f;
	};
	rtype.ptr.prototype.pointers = function() {
		var $ptr, _1, t;
		t = this;
		_1 = t.Kind();
		if ((_1 === (22)) || (_1 === (21)) || (_1 === (18)) || (_1 === (19)) || (_1 === (25)) || (_1 === (17))) {
			return true;
		} else {
			return false;
		}
	};
	rtype.prototype.pointers = function() { return this.$val.pointers(); };
	rtype.ptr.prototype.Comparable = function() {
		var $ptr, _1, _r, _r$1, _r$2, i, t, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; $ptr = $f.$ptr; _1 = $f._1; _r = $f._r; _r$1 = $f._r$1; _r$2 = $f._r$2; i = $f.i; t = $f.t; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		t = this;
			_1 = t.Kind();
			/* */ if ((_1 === (19)) || (_1 === (23)) || (_1 === (21))) { $s = 2; continue; }
			/* */ if (_1 === (17)) { $s = 3; continue; }
			/* */ if (_1 === (25)) { $s = 4; continue; }
			/* */ $s = 5; continue;
			/* if ((_1 === (19)) || (_1 === (23)) || (_1 === (21))) { */ case 2:
				$s = -1; return false;
			/* } else if (_1 === (17)) { */ case 3:
				_r = t.Elem().Comparable(); /* */ $s = 6; case 6: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
				$s = -1; return _r;
			/* } else if (_1 === (25)) { */ case 4:
				i = 0;
				/* while (true) { */ case 7:
					/* if (!(i < t.NumField())) { break; } */ if(!(i < t.NumField())) { $s = 8; continue; }
					_r$1 = t.Field(i); /* */ $s = 11; case 11: if($c) { $c = false; _r$1 = _r$1.$blk(); } if (_r$1 && _r$1.$blk !== undefined) { break s; }
					_r$2 = _r$1.Type.Comparable(); /* */ $s = 12; case 12: if($c) { $c = false; _r$2 = _r$2.$blk(); } if (_r$2 && _r$2.$blk !== undefined) { break s; }
					/* */ if (!_r$2) { $s = 9; continue; }
					/* */ $s = 10; continue;
					/* if (!_r$2) { */ case 9:
						$s = -1; return false;
					/* } */ case 10:
					i = i + (1) >> 0;
				/* } */ $s = 7; continue; case 8:
			/* } */ case 5:
		case 1:
		$s = -1; return true;
		/* */ } return; } if ($f === undefined) { $f = { $blk: rtype.ptr.prototype.Comparable }; } $f.$ptr = $ptr; $f._1 = _1; $f._r = _r; $f._r$1 = _r$1; $f._r$2 = _r$2; $f.i = i; $f.t = t; $f.$s = $s; $f.$r = $r; return $f;
	};
	rtype.prototype.Comparable = function() { return this.$val.Comparable(); };
	rtype.ptr.prototype.Method = function(i) {
		var $ptr, _i, _i$1, _r, _r$1, _ref, _ref$1, arg, fl, fn, ft, i, in$1, m, methods, mt, mtyp, out, p, pname, prop, ret, t, tt, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; $ptr = $f.$ptr; _i = $f._i; _i$1 = $f._i$1; _r = $f._r; _r$1 = $f._r$1; _ref = $f._ref; _ref$1 = $f._ref$1; arg = $f.arg; fl = $f.fl; fn = $f.fn; ft = $f.ft; i = $f.i; in$1 = $f.in$1; m = $f.m; methods = $f.methods; mt = $f.mt; mtyp = $f.mtyp; out = $f.out; p = $f.p; pname = $f.pname; prop = $f.prop; ret = $f.ret; t = $f.t; tt = $f.tt; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		prop = [prop];
		m = new Method.ptr("", "", $ifaceNil, new Value.ptr(ptrType$1.nil, 0, 0), 0);
		t = this;
		if (t.Kind() === 20) {
			tt = (t.kindType);
			Method.copy(m, tt.Method(i));
			$s = -1; return m;
		}
		_r = t.exportedMethods(); /* */ $s = 1; case 1: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
		methods = _r;
		if (i < 0 || i >= methods.$length) {
			$panic(new $String("reflect: Method index out of range"));
		}
		p = $clone(((i < 0 || i >= methods.$length) ? ($throwRuntimeError("index out of range"), undefined) : methods.$array[methods.$offset + i]), method);
		pname = $clone(t.nameOff(p.name), name);
		m.Name = $clone(pname, name).name();
		fl = 19;
		mtyp = t.typeOff(p.mtyp);
		ft = (mtyp.kindType);
		in$1 = $makeSlice(sliceType$11, 0, (1 + ft.in$().$length >> 0));
		in$1 = $append(in$1, t);
		_ref = ft.in$();
		_i = 0;
		while (true) {
			if (!(_i < _ref.$length)) { break; }
			arg = ((_i < 0 || _i >= _ref.$length) ? ($throwRuntimeError("index out of range"), undefined) : _ref.$array[_ref.$offset + _i]);
			in$1 = $append(in$1, arg);
			_i++;
		}
		out = $makeSlice(sliceType$11, 0, ft.out().$length);
		_ref$1 = ft.out();
		_i$1 = 0;
		while (true) {
			if (!(_i$1 < _ref$1.$length)) { break; }
			ret = ((_i$1 < 0 || _i$1 >= _ref$1.$length) ? ($throwRuntimeError("index out of range"), undefined) : _ref$1.$array[_ref$1.$offset + _i$1]);
			out = $append(out, ret);
			_i$1++;
		}
		_r$1 = FuncOf(in$1, out, ft.rtype.IsVariadic()); /* */ $s = 2; case 2: if($c) { $c = false; _r$1 = _r$1.$blk(); } if (_r$1 && _r$1.$blk !== undefined) { break s; }
		mt = _r$1;
		m.Type = mt;
		prop[0] = $internalize($methodSet(t.jsType)[i].prop, $String);
		fn = js.MakeFunc((function(prop) { return function(this$1, arguments$1) {
			var $ptr, arguments$1, rcvr, this$1;
			rcvr = (0 >= arguments$1.$length ? ($throwRuntimeError("index out of range"), undefined) : arguments$1.$array[arguments$1.$offset + 0]);
			return new $jsObjectPtr(rcvr[$externalize(prop[0], $String)].apply(rcvr, $externalize($subslice(arguments$1, 1), sliceType$9)));
		}; })(prop));
		m.Func = new Value.ptr($assertType(mt, ptrType$1), (fn), fl);
		m.Index = i;
		Method.copy(m, m);
		$s = -1; return m;
		/* */ } return; } if ($f === undefined) { $f = { $blk: rtype.ptr.prototype.Method }; } $f.$ptr = $ptr; $f._i = _i; $f._i$1 = _i$1; $f._r = _r; $f._r$1 = _r$1; $f._ref = _ref; $f._ref$1 = _ref$1; $f.arg = arg; $f.fl = fl; $f.fn = fn; $f.ft = ft; $f.i = i; $f.in$1 = in$1; $f.m = m; $f.methods = methods; $f.mt = mt; $f.mtyp = mtyp; $f.out = out; $f.p = p; $f.pname = pname; $f.prop = prop; $f.ret = ret; $f.t = t; $f.tt = tt; $f.$s = $s; $f.$r = $r; return $f;
	};
	rtype.prototype.Method = function(i) { return this.$val.Method(i); };
	Value.ptr.prototype.object = function() {
		var $ptr, _1, newVal, v, val;
		v = this;
		if ((v.typ.Kind() === 17) || (v.typ.Kind() === 25)) {
			return v.ptr;
		}
		if (!((((v.flag & 128) >>> 0) === 0))) {
			val = v.ptr.$get();
			if (!(val === $ifaceNil) && !(val.constructor === jsType(v.typ))) {
				switch (0) { default:
					_1 = v.typ.Kind();
					if ((_1 === (11)) || (_1 === (6))) {
						val = new (jsType(v.typ))(val.$high, val.$low);
					} else if ((_1 === (15)) || (_1 === (16))) {
						val = new (jsType(v.typ))(val.$real, val.$imag);
					} else if (_1 === (23)) {
						if (val === val.constructor.nil) {
							val = jsType(v.typ).nil;
							break;
						}
						newVal = new (jsType(v.typ))(val.$array);
						newVal.$offset = val.$offset;
						newVal.$length = val.$length;
						newVal.$capacity = val.$capacity;
						val = newVal;
					}
				}
			}
			return val;
		}
		return v.ptr;
	};
	Value.prototype.object = function() { return this.$val.object(); };
	Value.ptr.prototype.call = function(op, in$1) {
		var $ptr, _1, _arg, _arg$1, _arg$2, _arg$3, _i, _i$1, _i$2, _r, _r$1, _r$10, _r$11, _r$12, _r$13, _r$14, _r$15, _r$2, _r$3, _r$4, _r$5, _r$6, _r$7, _r$8, _r$9, _ref, _ref$1, _ref$2, _tmp, _tmp$1, _tuple, arg, argsArray, elem, fn, i, i$1, i$2, i$3, in$1, isSlice, m, n, nin, nout, op, origIn, rcvr, results, ret, slice, t, targ, v, x, x$1, x$2, xt, xt$1, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; $ptr = $f.$ptr; _1 = $f._1; _arg = $f._arg; _arg$1 = $f._arg$1; _arg$2 = $f._arg$2; _arg$3 = $f._arg$3; _i = $f._i; _i$1 = $f._i$1; _i$2 = $f._i$2; _r = $f._r; _r$1 = $f._r$1; _r$10 = $f._r$10; _r$11 = $f._r$11; _r$12 = $f._r$12; _r$13 = $f._r$13; _r$14 = $f._r$14; _r$15 = $f._r$15; _r$2 = $f._r$2; _r$3 = $f._r$3; _r$4 = $f._r$4; _r$5 = $f._r$5; _r$6 = $f._r$6; _r$7 = $f._r$7; _r$8 = $f._r$8; _r$9 = $f._r$9; _ref = $f._ref; _ref$1 = $f._ref$1; _ref$2 = $f._ref$2; _tmp = $f._tmp; _tmp$1 = $f._tmp$1; _tuple = $f._tuple; arg = $f.arg; argsArray = $f.argsArray; elem = $f.elem; fn = $f.fn; i = $f.i; i$1 = $f.i$1; i$2 = $f.i$2; i$3 = $f.i$3; in$1 = $f.in$1; isSlice = $f.isSlice; m = $f.m; n = $f.n; nin = $f.nin; nout = $f.nout; op = $f.op; origIn = $f.origIn; rcvr = $f.rcvr; results = $f.results; ret = $f.ret; slice = $f.slice; t = $f.t; targ = $f.targ; v = $f.v; x = $f.x; x$1 = $f.x$1; x$2 = $f.x$2; xt = $f.xt; xt$1 = $f.xt$1; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		v = this;
		t = ptrType$1.nil;
		fn = 0;
		rcvr = null;
		if (!((((v.flag & 512) >>> 0) === 0))) {
			_tuple = methodReceiver(op, $clone(v, Value), ((v.flag >> 0)) >> 10 >> 0);
			t = _tuple[1];
			fn = _tuple[2];
			rcvr = $clone(v, Value).object();
			if (isWrapped(v.typ)) {
				rcvr = new (jsType(v.typ))(rcvr);
			}
		} else {
			t = v.typ;
			fn = ($clone(v, Value).object());
			rcvr = undefined;
		}
		if (fn === 0) {
			$panic(new $String("reflect.Value.Call: call of nil function"));
		}
		isSlice = op === "CallSlice";
		n = t.NumIn();
		if (isSlice) {
			if (!t.IsVariadic()) {
				$panic(new $String("reflect: CallSlice of non-variadic function"));
			}
			if (in$1.$length < n) {
				$panic(new $String("reflect: CallSlice with too few input arguments"));
			}
			if (in$1.$length > n) {
				$panic(new $String("reflect: CallSlice with too many input arguments"));
			}
		} else {
			if (t.IsVariadic()) {
				n = n - (1) >> 0;
			}
			if (in$1.$length < n) {
				$panic(new $String("reflect: Call with too few input arguments"));
			}
			if (!t.IsVariadic() && in$1.$length > n) {
				$panic(new $String("reflect: Call with too many input arguments"));
			}
		}
		_ref = in$1;
		_i = 0;
		while (true) {
			if (!(_i < _ref.$length)) { break; }
			x = ((_i < 0 || _i >= _ref.$length) ? ($throwRuntimeError("index out of range"), undefined) : _ref.$array[_ref.$offset + _i]);
			if ($clone(x, Value).Kind() === 0) {
				$panic(new $String("reflect: " + op + " using zero Value argument"));
			}
			_i++;
		}
		i = 0;
		/* while (true) { */ case 1:
			/* if (!(i < n)) { break; } */ if(!(i < n)) { $s = 2; continue; }
			_tmp = $clone(((i < 0 || i >= in$1.$length) ? ($throwRuntimeError("index out of range"), undefined) : in$1.$array[in$1.$offset + i]), Value).Type();
			_tmp$1 = t.In(i);
			xt = _tmp;
			targ = _tmp$1;
			_r = xt.AssignableTo(targ); /* */ $s = 5; case 5: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
			/* */ if (!_r) { $s = 3; continue; }
			/* */ $s = 4; continue;
			/* if (!_r) { */ case 3:
				_r$1 = xt.String(); /* */ $s = 6; case 6: if($c) { $c = false; _r$1 = _r$1.$blk(); } if (_r$1 && _r$1.$blk !== undefined) { break s; }
				_r$2 = targ.String(); /* */ $s = 7; case 7: if($c) { $c = false; _r$2 = _r$2.$blk(); } if (_r$2 && _r$2.$blk !== undefined) { break s; }
				$panic(new $String("reflect: " + op + " using " + _r$1 + " as type " + _r$2));
			/* } */ case 4:
			i = i + (1) >> 0;
		/* } */ $s = 1; continue; case 2:
		/* */ if (!isSlice && t.IsVariadic()) { $s = 8; continue; }
		/* */ $s = 9; continue;
		/* if (!isSlice && t.IsVariadic()) { */ case 8:
			m = in$1.$length - n >> 0;
			_r$3 = MakeSlice(t.In(n), m, m); /* */ $s = 10; case 10: if($c) { $c = false; _r$3 = _r$3.$blk(); } if (_r$3 && _r$3.$blk !== undefined) { break s; }
			slice = _r$3;
			_r$4 = t.In(n).Elem(); /* */ $s = 11; case 11: if($c) { $c = false; _r$4 = _r$4.$blk(); } if (_r$4 && _r$4.$blk !== undefined) { break s; }
			elem = _r$4;
			i$1 = 0;
			/* while (true) { */ case 12:
				/* if (!(i$1 < m)) { break; } */ if(!(i$1 < m)) { $s = 13; continue; }
				x$2 = (x$1 = n + i$1 >> 0, ((x$1 < 0 || x$1 >= in$1.$length) ? ($throwRuntimeError("index out of range"), undefined) : in$1.$array[in$1.$offset + x$1]));
				xt$1 = $clone(x$2, Value).Type();
				_r$5 = xt$1.AssignableTo(elem); /* */ $s = 16; case 16: if($c) { $c = false; _r$5 = _r$5.$blk(); } if (_r$5 && _r$5.$blk !== undefined) { break s; }
				/* */ if (!_r$5) { $s = 14; continue; }
				/* */ $s = 15; continue;
				/* if (!_r$5) { */ case 14:
					_r$6 = xt$1.String(); /* */ $s = 17; case 17: if($c) { $c = false; _r$6 = _r$6.$blk(); } if (_r$6 && _r$6.$blk !== undefined) { break s; }
					_r$7 = elem.String(); /* */ $s = 18; case 18: if($c) { $c = false; _r$7 = _r$7.$blk(); } if (_r$7 && _r$7.$blk !== undefined) { break s; }
					$panic(new $String("reflect: cannot use " + _r$6 + " as type " + _r$7 + " in " + op));
				/* } */ case 15:
				_r$8 = $clone(slice, Value).Index(i$1); /* */ $s = 19; case 19: if($c) { $c = false; _r$8 = _r$8.$blk(); } if (_r$8 && _r$8.$blk !== undefined) { break s; }
				$r = $clone(_r$8, Value).Set($clone(x$2, Value)); /* */ $s = 20; case 20: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
				i$1 = i$1 + (1) >> 0;
			/* } */ $s = 12; continue; case 13:
			origIn = in$1;
			in$1 = $makeSlice(sliceType$10, (n + 1 >> 0));
			$copySlice($subslice(in$1, 0, n), origIn);
			((n < 0 || n >= in$1.$length) ? ($throwRuntimeError("index out of range"), undefined) : in$1.$array[in$1.$offset + n] = slice);
		/* } */ case 9:
		nin = in$1.$length;
		if (!((nin === t.NumIn()))) {
			$panic(new $String("reflect.Value.Call: wrong argument count"));
		}
		nout = t.NumOut();
		argsArray = new ($global.Array)(t.NumIn());
		_ref$1 = in$1;
		_i$1 = 0;
		/* while (true) { */ case 21:
			/* if (!(_i$1 < _ref$1.$length)) { break; } */ if(!(_i$1 < _ref$1.$length)) { $s = 22; continue; }
			i$2 = _i$1;
			arg = ((_i$1 < 0 || _i$1 >= _ref$1.$length) ? ($throwRuntimeError("index out of range"), undefined) : _ref$1.$array[_ref$1.$offset + _i$1]);
			_arg = t.In(i$2);
			_r$9 = t.In(i$2).common(); /* */ $s = 23; case 23: if($c) { $c = false; _r$9 = _r$9.$blk(); } if (_r$9 && _r$9.$blk !== undefined) { break s; }
			_arg$1 = _r$9;
			_arg$2 = 0;
			_r$10 = $clone(arg, Value).assignTo("reflect.Value.Call", _arg$1, _arg$2); /* */ $s = 24; case 24: if($c) { $c = false; _r$10 = _r$10.$blk(); } if (_r$10 && _r$10.$blk !== undefined) { break s; }
			_r$11 = $clone(_r$10, Value).object(); /* */ $s = 25; case 25: if($c) { $c = false; _r$11 = _r$11.$blk(); } if (_r$11 && _r$11.$blk !== undefined) { break s; }
			_arg$3 = _r$11;
			_r$12 = unwrapJsObject(_arg, _arg$3); /* */ $s = 26; case 26: if($c) { $c = false; _r$12 = _r$12.$blk(); } if (_r$12 && _r$12.$blk !== undefined) { break s; }
			argsArray[i$2] = _r$12;
			_i$1++;
		/* } */ $s = 21; continue; case 22:
		_r$13 = callHelper(new sliceType$5([new $jsObjectPtr(fn), new $jsObjectPtr(rcvr), new $jsObjectPtr(argsArray)])); /* */ $s = 27; case 27: if($c) { $c = false; _r$13 = _r$13.$blk(); } if (_r$13 && _r$13.$blk !== undefined) { break s; }
		results = _r$13;
			_1 = nout;
			/* */ if (_1 === (0)) { $s = 29; continue; }
			/* */ if (_1 === (1)) { $s = 30; continue; }
			/* */ $s = 31; continue;
			/* if (_1 === (0)) { */ case 29:
				$s = -1; return sliceType$10.nil;
			/* } else if (_1 === (1)) { */ case 30:
				_r$14 = makeValue(t.Out(0), wrapJsObject(t.Out(0), results), 0); /* */ $s = 33; case 33: if($c) { $c = false; _r$14 = _r$14.$blk(); } if (_r$14 && _r$14.$blk !== undefined) { break s; }
				$s = -1; return new sliceType$10([$clone(_r$14, Value)]);
			/* } else { */ case 31:
				ret = $makeSlice(sliceType$10, nout);
				_ref$2 = ret;
				_i$2 = 0;
				/* while (true) { */ case 34:
					/* if (!(_i$2 < _ref$2.$length)) { break; } */ if(!(_i$2 < _ref$2.$length)) { $s = 35; continue; }
					i$3 = _i$2;
					_r$15 = makeValue(t.Out(i$3), wrapJsObject(t.Out(i$3), results[i$3]), 0); /* */ $s = 36; case 36: if($c) { $c = false; _r$15 = _r$15.$blk(); } if (_r$15 && _r$15.$blk !== undefined) { break s; }
					((i$3 < 0 || i$3 >= ret.$length) ? ($throwRuntimeError("index out of range"), undefined) : ret.$array[ret.$offset + i$3] = _r$15);
					_i$2++;
				/* } */ $s = 34; continue; case 35:
				$s = -1; return ret;
			/* } */ case 32:
		case 28:
		$s = -1; return sliceType$10.nil;
		/* */ } return; } if ($f === undefined) { $f = { $blk: Value.ptr.prototype.call }; } $f.$ptr = $ptr; $f._1 = _1; $f._arg = _arg; $f._arg$1 = _arg$1; $f._arg$2 = _arg$2; $f._arg$3 = _arg$3; $f._i = _i; $f._i$1 = _i$1; $f._i$2 = _i$2; $f._r = _r; $f._r$1 = _r$1; $f._r$10 = _r$10; $f._r$11 = _r$11; $f._r$12 = _r$12; $f._r$13 = _r$13; $f._r$14 = _r$14; $f._r$15 = _r$15; $f._r$2 = _r$2; $f._r$3 = _r$3; $f._r$4 = _r$4; $f._r$5 = _r$5; $f._r$6 = _r$6; $f._r$7 = _r$7; $f._r$8 = _r$8; $f._r$9 = _r$9; $f._ref = _ref; $f._ref$1 = _ref$1; $f._ref$2 = _ref$2; $f._tmp = _tmp; $f._tmp$1 = _tmp$1; $f._tuple = _tuple; $f.arg = arg; $f.argsArray = argsArray; $f.elem = elem; $f.fn = fn; $f.i = i; $f.i$1 = i$1; $f.i$2 = i$2; $f.i$3 = i$3; $f.in$1 = in$1; $f.isSlice = isSlice; $f.m = m; $f.n = n; $f.nin = nin; $f.nout = nout; $f.op = op; $f.origIn = origIn; $f.rcvr = rcvr; $f.results = results; $f.ret = ret; $f.slice = slice; $f.t = t; $f.targ = targ; $f.v = v; $f.x = x; $f.x$1 = x$1; $f.x$2 = x$2; $f.xt = xt; $f.xt$1 = xt$1; $f.$s = $s; $f.$r = $r; return $f;
	};
	Value.prototype.call = function(op, in$1) { return this.$val.call(op, in$1); };
	Value.ptr.prototype.Cap = function() {
		var $ptr, _1, k, v;
		v = this;
		k = new flag(v.flag).kind();
		_1 = k;
		if (_1 === (17)) {
			return v.typ.Len();
		} else if ((_1 === (18)) || (_1 === (23))) {
			return $parseInt($clone(v, Value).object().$capacity) >> 0;
		}
		$panic(new ValueError.ptr("reflect.Value.Cap", k));
	};
	Value.prototype.Cap = function() { return this.$val.Cap(); };
	wrapJsObject = function(typ, val) {
		var $ptr, typ, val;
		if ($interfaceIsEqual(typ, jsObjectPtr)) {
			return new (jsType(jsObjectPtr))(val);
		}
		return val;
	};
	unwrapJsObject = function(typ, val) {
		var $ptr, typ, val;
		if ($interfaceIsEqual(typ, jsObjectPtr)) {
			return val.object;
		}
		return val;
	};
	Value.ptr.prototype.Elem = function() {
		var $ptr, _1, _r, fl, k, tt, typ, v, val, val$1, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; $ptr = $f.$ptr; _1 = $f._1; _r = $f._r; fl = $f.fl; k = $f.k; tt = $f.tt; typ = $f.typ; v = $f.v; val = $f.val; val$1 = $f.val$1; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		v = this;
			k = new flag(v.flag).kind();
			_1 = k;
			/* */ if (_1 === (20)) { $s = 2; continue; }
			/* */ if (_1 === (22)) { $s = 3; continue; }
			/* */ $s = 4; continue;
			/* if (_1 === (20)) { */ case 2:
				val = $clone(v, Value).object();
				if (val === $ifaceNil) {
					$s = -1; return new Value.ptr(ptrType$1.nil, 0, 0);
				}
				typ = reflectType(val.constructor);
				_r = makeValue(typ, val.$val, (v.flag & 96) >>> 0); /* */ $s = 6; case 6: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
				$s = -1; return _r;
			/* } else if (_1 === (22)) { */ case 3:
				if ($clone(v, Value).IsNil()) {
					$s = -1; return new Value.ptr(ptrType$1.nil, 0, 0);
				}
				val$1 = $clone(v, Value).object();
				tt = (v.typ.kindType);
				fl = (((((v.flag & 96) >>> 0) | 128) >>> 0) | 256) >>> 0;
				fl = (fl | (((tt.elem.Kind() >>> 0)))) >>> 0;
				$s = -1; return new Value.ptr(tt.elem, (wrapJsObject(tt.elem, val$1)), fl);
			/* } else { */ case 4:
				$panic(new ValueError.ptr("reflect.Value.Elem", k));
			/* } */ case 5:
		case 1:
		$s = -1; return new Value.ptr(ptrType$1.nil, 0, 0);
		/* */ } return; } if ($f === undefined) { $f = { $blk: Value.ptr.prototype.Elem }; } $f.$ptr = $ptr; $f._1 = _1; $f._r = _r; $f.fl = fl; $f.k = k; $f.tt = tt; $f.typ = typ; $f.v = v; $f.val = val; $f.val$1 = val$1; $f.$s = $s; $f.$r = $r; return $f;
	};
	Value.prototype.Elem = function() { return this.$val.Elem(); };
	Value.ptr.prototype.Field = function(i) {
		var $ptr, _r, _r$1, _r$2, field, fl, i, jsTag, o, prop, s, tag, tt, typ, v, x, x$1, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; $ptr = $f.$ptr; _r = $f._r; _r$1 = $f._r$1; _r$2 = $f._r$2; field = $f.field; fl = $f.fl; i = $f.i; jsTag = $f.jsTag; o = $f.o; prop = $f.prop; s = $f.s; tag = $f.tag; tt = $f.tt; typ = $f.typ; v = $f.v; x = $f.x; x$1 = $f.x$1; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		jsTag = [jsTag];
		prop = [prop];
		s = [s];
		typ = [typ];
		v = this;
		if (!((new flag(v.flag).kind() === 25))) {
			$panic(new ValueError.ptr("reflect.Value.Field", new flag(v.flag).kind()));
		}
		tt = (v.typ.kindType);
		if (((i >>> 0)) >= ((tt.fields.$length >>> 0))) {
			$panic(new $String("reflect: Field index out of range"));
		}
		prop[0] = $internalize(jsType(v.typ).fields[i].prop, $String);
		field = (x = tt.fields, ((i < 0 || i >= x.$length) ? ($throwRuntimeError("index out of range"), undefined) : x.$array[x.$offset + i]));
		typ[0] = field.typ;
		fl = (((v.flag & 416) >>> 0) | ((typ[0].Kind() >>> 0))) >>> 0;
		if (!$clone(field.name, name).isExported()) {
			if ($clone(field.name, name).name() === "") {
				fl = (fl | (64)) >>> 0;
			} else {
				fl = (fl | (32)) >>> 0;
			}
		}
		tag = $clone((x$1 = tt.fields, ((i < 0 || i >= x$1.$length) ? ($throwRuntimeError("index out of range"), undefined) : x$1.$array[x$1.$offset + i])).name, name).tag();
		/* */ if (!(tag === "") && !((i === 0))) { $s = 1; continue; }
		/* */ $s = 2; continue;
		/* if (!(tag === "") && !((i === 0))) { */ case 1:
			jsTag[0] = getJsTag(tag);
			/* */ if (!(jsTag[0] === "")) { $s = 3; continue; }
			/* */ $s = 4; continue;
			/* if (!(jsTag[0] === "")) { */ case 3:
				/* while (true) { */ case 5:
					o = [o];
					_r = $clone(v, Value).Field(0); /* */ $s = 7; case 7: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
					v = _r;
					/* */ if (v.typ === jsObjectPtr) { $s = 8; continue; }
					/* */ $s = 9; continue;
					/* if (v.typ === jsObjectPtr) { */ case 8:
						o[0] = $clone(v, Value).object().object;
						$s = -1; return new Value.ptr(typ[0], (new (jsType(PtrTo(typ[0])))((function(jsTag, o, prop, s, typ) { return function() {
							var $ptr;
							return $internalize(o[0][$externalize(jsTag[0], $String)], jsType(typ[0]));
						}; })(jsTag, o, prop, s, typ), (function(jsTag, o, prop, s, typ) { return function(x$2) {
							var $ptr, x$2;
							o[0][$externalize(jsTag[0], $String)] = $externalize(x$2, jsType(typ[0]));
						}; })(jsTag, o, prop, s, typ))), fl);
					/* } */ case 9:
					/* */ if (v.typ.Kind() === 22) { $s = 10; continue; }
					/* */ $s = 11; continue;
					/* if (v.typ.Kind() === 22) { */ case 10:
						_r$1 = $clone(v, Value).Elem(); /* */ $s = 12; case 12: if($c) { $c = false; _r$1 = _r$1.$blk(); } if (_r$1 && _r$1.$blk !== undefined) { break s; }
						v = _r$1;
					/* } */ case 11:
				/* } */ $s = 5; continue; case 6:
			/* } */ case 4:
		/* } */ case 2:
		s[0] = v.ptr;
		/* */ if (!((((fl & 128) >>> 0) === 0)) && !((typ[0].Kind() === 17)) && !((typ[0].Kind() === 25))) { $s = 13; continue; }
		/* */ $s = 14; continue;
		/* if (!((((fl & 128) >>> 0) === 0)) && !((typ[0].Kind() === 17)) && !((typ[0].Kind() === 25))) { */ case 13:
			$s = -1; return new Value.ptr(typ[0], (new (jsType(PtrTo(typ[0])))((function(jsTag, prop, s, typ) { return function() {
				var $ptr;
				return wrapJsObject(typ[0], s[0][$externalize(prop[0], $String)]);
			}; })(jsTag, prop, s, typ), (function(jsTag, prop, s, typ) { return function(x$2) {
				var $ptr, x$2;
				s[0][$externalize(prop[0], $String)] = unwrapJsObject(typ[0], x$2);
			}; })(jsTag, prop, s, typ))), fl);
		/* } */ case 14:
		_r$2 = makeValue(typ[0], wrapJsObject(typ[0], s[0][$externalize(prop[0], $String)]), fl); /* */ $s = 15; case 15: if($c) { $c = false; _r$2 = _r$2.$blk(); } if (_r$2 && _r$2.$blk !== undefined) { break s; }
		$s = -1; return _r$2;
		/* */ } return; } if ($f === undefined) { $f = { $blk: Value.ptr.prototype.Field }; } $f.$ptr = $ptr; $f._r = _r; $f._r$1 = _r$1; $f._r$2 = _r$2; $f.field = field; $f.fl = fl; $f.i = i; $f.jsTag = jsTag; $f.o = o; $f.prop = prop; $f.s = s; $f.tag = tag; $f.tt = tt; $f.typ = typ; $f.v = v; $f.x = x; $f.x$1 = x$1; $f.$s = $s; $f.$r = $r; return $f;
	};
	Value.prototype.Field = function(i) { return this.$val.Field(i); };
	getJsTag = function(tag) {
		var $ptr, _tuple, i, name$1, qvalue, tag, value;
		while (true) {
			if (!(!(tag === ""))) { break; }
			i = 0;
			while (true) {
				if (!(i < tag.length && (tag.charCodeAt(i) === 32))) { break; }
				i = i + (1) >> 0;
			}
			tag = $substring(tag, i);
			if (tag === "") {
				break;
			}
			i = 0;
			while (true) {
				if (!(i < tag.length && !((tag.charCodeAt(i) === 32)) && !((tag.charCodeAt(i) === 58)) && !((tag.charCodeAt(i) === 34)))) { break; }
				i = i + (1) >> 0;
			}
			if ((i + 1 >> 0) >= tag.length || !((tag.charCodeAt(i) === 58)) || !((tag.charCodeAt((i + 1 >> 0)) === 34))) {
				break;
			}
			name$1 = ($substring(tag, 0, i));
			tag = $substring(tag, (i + 1 >> 0));
			i = 1;
			while (true) {
				if (!(i < tag.length && !((tag.charCodeAt(i) === 34)))) { break; }
				if (tag.charCodeAt(i) === 92) {
					i = i + (1) >> 0;
				}
				i = i + (1) >> 0;
			}
			if (i >= tag.length) {
				break;
			}
			qvalue = ($substring(tag, 0, (i + 1 >> 0)));
			tag = $substring(tag, (i + 1 >> 0));
			if (name$1 === "js") {
				_tuple = strconv.Unquote(qvalue);
				value = _tuple[0];
				return value;
			}
		}
		return "";
	};
	Value.ptr.prototype.Index = function(i) {
		var $ptr, _1, _r, _r$1, a, a$1, c, fl, fl$1, fl$2, i, k, s, str, tt, tt$1, typ, typ$1, v, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; $ptr = $f.$ptr; _1 = $f._1; _r = $f._r; _r$1 = $f._r$1; a = $f.a; a$1 = $f.a$1; c = $f.c; fl = $f.fl; fl$1 = $f.fl$1; fl$2 = $f.fl$2; i = $f.i; k = $f.k; s = $f.s; str = $f.str; tt = $f.tt; tt$1 = $f.tt$1; typ = $f.typ; typ$1 = $f.typ$1; v = $f.v; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		a = [a];
		a$1 = [a$1];
		c = [c];
		i = [i];
		typ = [typ];
		typ$1 = [typ$1];
		v = this;
			k = new flag(v.flag).kind();
			_1 = k;
			/* */ if (_1 === (17)) { $s = 2; continue; }
			/* */ if (_1 === (23)) { $s = 3; continue; }
			/* */ if (_1 === (24)) { $s = 4; continue; }
			/* */ $s = 5; continue;
			/* if (_1 === (17)) { */ case 2:
				tt = (v.typ.kindType);
				if (i[0] < 0 || i[0] > ((tt.len >> 0))) {
					$panic(new $String("reflect: array index out of range"));
				}
				typ[0] = tt.elem;
				fl = (v.flag & 480) >>> 0;
				fl = (fl | (((typ[0].Kind() >>> 0)))) >>> 0;
				a[0] = v.ptr;
				/* */ if (!((((fl & 128) >>> 0) === 0)) && !((typ[0].Kind() === 17)) && !((typ[0].Kind() === 25))) { $s = 7; continue; }
				/* */ $s = 8; continue;
				/* if (!((((fl & 128) >>> 0) === 0)) && !((typ[0].Kind() === 17)) && !((typ[0].Kind() === 25))) { */ case 7:
					$s = -1; return new Value.ptr(typ[0], (new (jsType(PtrTo(typ[0])))((function(a, a$1, c, i, typ, typ$1) { return function() {
						var $ptr;
						return wrapJsObject(typ[0], a[0][i[0]]);
					}; })(a, a$1, c, i, typ, typ$1), (function(a, a$1, c, i, typ, typ$1) { return function(x) {
						var $ptr, x;
						a[0][i[0]] = unwrapJsObject(typ[0], x);
					}; })(a, a$1, c, i, typ, typ$1))), fl);
				/* } */ case 8:
				_r = makeValue(typ[0], wrapJsObject(typ[0], a[0][i[0]]), fl); /* */ $s = 9; case 9: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
				$s = -1; return _r;
			/* } else if (_1 === (23)) { */ case 3:
				s = $clone(v, Value).object();
				if (i[0] < 0 || i[0] >= ($parseInt(s.$length) >> 0)) {
					$panic(new $String("reflect: slice index out of range"));
				}
				tt$1 = (v.typ.kindType);
				typ$1[0] = tt$1.elem;
				fl$1 = (384 | ((v.flag & 96) >>> 0)) >>> 0;
				fl$1 = (fl$1 | (((typ$1[0].Kind() >>> 0)))) >>> 0;
				i[0] = i[0] + (($parseInt(s.$offset) >> 0)) >> 0;
				a$1[0] = s.$array;
				/* */ if (!((((fl$1 & 128) >>> 0) === 0)) && !((typ$1[0].Kind() === 17)) && !((typ$1[0].Kind() === 25))) { $s = 10; continue; }
				/* */ $s = 11; continue;
				/* if (!((((fl$1 & 128) >>> 0) === 0)) && !((typ$1[0].Kind() === 17)) && !((typ$1[0].Kind() === 25))) { */ case 10:
					$s = -1; return new Value.ptr(typ$1[0], (new (jsType(PtrTo(typ$1[0])))((function(a, a$1, c, i, typ, typ$1) { return function() {
						var $ptr;
						return wrapJsObject(typ$1[0], a$1[0][i[0]]);
					}; })(a, a$1, c, i, typ, typ$1), (function(a, a$1, c, i, typ, typ$1) { return function(x) {
						var $ptr, x;
						a$1[0][i[0]] = unwrapJsObject(typ$1[0], x);
					}; })(a, a$1, c, i, typ, typ$1))), fl$1);
				/* } */ case 11:
				_r$1 = makeValue(typ$1[0], wrapJsObject(typ$1[0], a$1[0][i[0]]), fl$1); /* */ $s = 12; case 12: if($c) { $c = false; _r$1 = _r$1.$blk(); } if (_r$1 && _r$1.$blk !== undefined) { break s; }
				$s = -1; return _r$1;
			/* } else if (_1 === (24)) { */ case 4:
				str = (v.ptr).$get();
				if (i[0] < 0 || i[0] >= str.length) {
					$panic(new $String("reflect: string index out of range"));
				}
				fl$2 = (((v.flag & 96) >>> 0) | 8) >>> 0;
				c[0] = str.charCodeAt(i[0]);
				$s = -1; return new Value.ptr(uint8Type, ((c.$ptr || (c.$ptr = new ptrType$5(function() { return this.$target[0]; }, function($v) { this.$target[0] = $v; }, c)))), (fl$2 | 128) >>> 0);
			/* } else { */ case 5:
				$panic(new ValueError.ptr("reflect.Value.Index", k));
			/* } */ case 6:
		case 1:
		$s = -1; return new Value.ptr(ptrType$1.nil, 0, 0);
		/* */ } return; } if ($f === undefined) { $f = { $blk: Value.ptr.prototype.Index }; } $f.$ptr = $ptr; $f._1 = _1; $f._r = _r; $f._r$1 = _r$1; $f.a = a; $f.a$1 = a$1; $f.c = c; $f.fl = fl; $f.fl$1 = fl$1; $f.fl$2 = fl$2; $f.i = i; $f.k = k; $f.s = s; $f.str = str; $f.tt = tt; $f.tt$1 = tt$1; $f.typ = typ; $f.typ$1 = typ$1; $f.v = v; $f.$s = $s; $f.$r = $r; return $f;
	};
	Value.prototype.Index = function(i) { return this.$val.Index(i); };
	Value.ptr.prototype.InterfaceData = function() {
		var $ptr, v;
		v = this;
		$panic(errors.New("InterfaceData is not supported by GopherJS"));
	};
	Value.prototype.InterfaceData = function() { return this.$val.InterfaceData(); };
	Value.ptr.prototype.IsNil = function() {
		var $ptr, _1, k, v;
		v = this;
		k = new flag(v.flag).kind();
		_1 = k;
		if ((_1 === (22)) || (_1 === (23))) {
			return $clone(v, Value).object() === jsType(v.typ).nil;
		} else if (_1 === (18)) {
			return $clone(v, Value).object() === $chanNil;
		} else if (_1 === (19)) {
			return $clone(v, Value).object() === $throwNilPointerError;
		} else if (_1 === (21)) {
			return $clone(v, Value).object() === false;
		} else if (_1 === (20)) {
			return $clone(v, Value).object() === $ifaceNil;
		} else {
			$panic(new ValueError.ptr("reflect.Value.IsNil", k));
		}
	};
	Value.prototype.IsNil = function() { return this.$val.IsNil(); };
	Value.ptr.prototype.Len = function() {
		var $ptr, _1, k, v;
		v = this;
		k = new flag(v.flag).kind();
		_1 = k;
		if ((_1 === (17)) || (_1 === (24))) {
			return $parseInt($clone(v, Value).object().length);
		} else if (_1 === (23)) {
			return $parseInt($clone(v, Value).object().$length) >> 0;
		} else if (_1 === (18)) {
			return $parseInt($clone(v, Value).object().$buffer.length) >> 0;
		} else if (_1 === (21)) {
			return $parseInt($keys($clone(v, Value).object()).length);
		} else {
			$panic(new ValueError.ptr("reflect.Value.Len", k));
		}
	};
	Value.prototype.Len = function() { return this.$val.Len(); };
	Value.ptr.prototype.Pointer = function() {
		var $ptr, _1, k, v;
		v = this;
		k = new flag(v.flag).kind();
		_1 = k;
		if ((_1 === (18)) || (_1 === (21)) || (_1 === (22)) || (_1 === (26))) {
			if ($clone(v, Value).IsNil()) {
				return 0;
			}
			return $clone(v, Value).object();
		} else if (_1 === (19)) {
			if ($clone(v, Value).IsNil()) {
				return 0;
			}
			return 1;
		} else if (_1 === (23)) {
			if ($clone(v, Value).IsNil()) {
				return 0;
			}
			return $clone(v, Value).object().$array;
		} else {
			$panic(new ValueError.ptr("reflect.Value.Pointer", k));
		}
	};
	Value.prototype.Pointer = function() { return this.$val.Pointer(); };
	Value.ptr.prototype.Set = function(x) {
		var $ptr, _1, _r, _r$1, v, x, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; $ptr = $f.$ptr; _1 = $f._1; _r = $f._r; _r$1 = $f._r$1; v = $f.v; x = $f.x; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		v = this;
		new flag(v.flag).mustBeAssignable();
		new flag(x.flag).mustBeExported();
		_r = $clone(x, Value).assignTo("reflect.Set", v.typ, 0); /* */ $s = 1; case 1: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
		x = _r;
		/* */ if (!((((v.flag & 128) >>> 0) === 0))) { $s = 2; continue; }
		/* */ $s = 3; continue;
		/* if (!((((v.flag & 128) >>> 0) === 0))) { */ case 2:
				_1 = v.typ.Kind();
				/* */ if (_1 === (17)) { $s = 5; continue; }
				/* */ if (_1 === (20)) { $s = 6; continue; }
				/* */ if (_1 === (25)) { $s = 7; continue; }
				/* */ $s = 8; continue;
				/* if (_1 === (17)) { */ case 5:
					jsType(v.typ).copy(v.ptr, x.ptr);
					$s = 9; continue;
				/* } else if (_1 === (20)) { */ case 6:
					_r$1 = valueInterface($clone(x, Value), false); /* */ $s = 10; case 10: if($c) { $c = false; _r$1 = _r$1.$blk(); } if (_r$1 && _r$1.$blk !== undefined) { break s; }
					v.ptr.$set(_r$1);
					$s = 9; continue;
				/* } else if (_1 === (25)) { */ case 7:
					copyStruct(v.ptr, x.ptr, v.typ);
					$s = 9; continue;
				/* } else { */ case 8:
					v.ptr.$set($clone(x, Value).object());
				/* } */ case 9:
			case 4:
			$s = -1; return;
		/* } */ case 3:
		v.ptr = x.ptr;
		$s = -1; return;
		/* */ } return; } if ($f === undefined) { $f = { $blk: Value.ptr.prototype.Set }; } $f.$ptr = $ptr; $f._1 = _1; $f._r = _r; $f._r$1 = _r$1; $f.v = v; $f.x = x; $f.$s = $s; $f.$r = $r; return $f;
	};
	Value.prototype.Set = function(x) { return this.$val.Set(x); };
	Value.ptr.prototype.SetBytes = function(x) {
		var $ptr, _r, _r$1, _v, slice, typedSlice, v, x, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; $ptr = $f.$ptr; _r = $f._r; _r$1 = $f._r$1; _v = $f._v; slice = $f.slice; typedSlice = $f.typedSlice; v = $f.v; x = $f.x; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		v = this;
		new flag(v.flag).mustBeAssignable();
		new flag(v.flag).mustBe(23);
		_r = v.typ.Elem().Kind(); /* */ $s = 3; case 3: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
		/* */ if (!((_r === 8))) { $s = 1; continue; }
		/* */ $s = 2; continue;
		/* if (!((_r === 8))) { */ case 1:
			$panic(new $String("reflect.Value.SetBytes of non-byte slice"));
		/* } */ case 2:
		slice = x;
		if (!(v.typ.Name() === "")) { _v = true; $s = 6; continue s; }
		_r$1 = v.typ.Elem().Name(); /* */ $s = 7; case 7: if($c) { $c = false; _r$1 = _r$1.$blk(); } if (_r$1 && _r$1.$blk !== undefined) { break s; }
		_v = !(_r$1 === ""); case 6:
		/* */ if (_v) { $s = 4; continue; }
		/* */ $s = 5; continue;
		/* if (_v) { */ case 4:
			typedSlice = new (jsType(v.typ))(slice.$array);
			typedSlice.$offset = slice.$offset;
			typedSlice.$length = slice.$length;
			typedSlice.$capacity = slice.$capacity;
			slice = typedSlice;
		/* } */ case 5:
		v.ptr.$set(slice);
		$s = -1; return;
		/* */ } return; } if ($f === undefined) { $f = { $blk: Value.ptr.prototype.SetBytes }; } $f.$ptr = $ptr; $f._r = _r; $f._r$1 = _r$1; $f._v = _v; $f.slice = slice; $f.typedSlice = typedSlice; $f.v = v; $f.x = x; $f.$s = $s; $f.$r = $r; return $f;
	};
	Value.prototype.SetBytes = function(x) { return this.$val.SetBytes(x); };
	Value.ptr.prototype.SetCap = function(n) {
		var $ptr, n, newSlice, s, v;
		v = this;
		new flag(v.flag).mustBeAssignable();
		new flag(v.flag).mustBe(23);
		s = v.ptr.$get();
		if (n < ($parseInt(s.$length) >> 0) || n > ($parseInt(s.$capacity) >> 0)) {
			$panic(new $String("reflect: slice capacity out of range in SetCap"));
		}
		newSlice = new (jsType(v.typ))(s.$array);
		newSlice.$offset = s.$offset;
		newSlice.$length = s.$length;
		newSlice.$capacity = n;
		v.ptr.$set(newSlice);
	};
	Value.prototype.SetCap = function(n) { return this.$val.SetCap(n); };
	Value.ptr.prototype.SetLen = function(n) {
		var $ptr, n, newSlice, s, v;
		v = this;
		new flag(v.flag).mustBeAssignable();
		new flag(v.flag).mustBe(23);
		s = v.ptr.$get();
		if (n < 0 || n > ($parseInt(s.$capacity) >> 0)) {
			$panic(new $String("reflect: slice length out of range in SetLen"));
		}
		newSlice = new (jsType(v.typ))(s.$array);
		newSlice.$offset = s.$offset;
		newSlice.$length = n;
		newSlice.$capacity = s.$capacity;
		v.ptr.$set(newSlice);
	};
	Value.prototype.SetLen = function(n) { return this.$val.SetLen(n); };
	Value.ptr.prototype.Slice = function(i, j) {
		var $ptr, _1, _r, _r$1, cap, i, j, kind, s, str, tt, typ, v, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; $ptr = $f.$ptr; _1 = $f._1; _r = $f._r; _r$1 = $f._r$1; cap = $f.cap; i = $f.i; j = $f.j; kind = $f.kind; s = $f.s; str = $f.str; tt = $f.tt; typ = $f.typ; v = $f.v; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		v = this;
		cap = 0;
		typ = $ifaceNil;
		s = null;
			kind = new flag(v.flag).kind();
			_1 = kind;
			/* */ if (_1 === (17)) { $s = 2; continue; }
			/* */ if (_1 === (23)) { $s = 3; continue; }
			/* */ if (_1 === (24)) { $s = 4; continue; }
			/* */ $s = 5; continue;
			/* if (_1 === (17)) { */ case 2:
				if (((v.flag & 256) >>> 0) === 0) {
					$panic(new $String("reflect.Value.Slice: slice of unaddressable array"));
				}
				tt = (v.typ.kindType);
				cap = ((tt.len >> 0));
				typ = SliceOf(tt.elem);
				s = new (jsType(typ))($clone(v, Value).object());
				$s = 6; continue;
			/* } else if (_1 === (23)) { */ case 3:
				typ = v.typ;
				s = $clone(v, Value).object();
				cap = $parseInt(s.$capacity) >> 0;
				$s = 6; continue;
			/* } else if (_1 === (24)) { */ case 4:
				str = (v.ptr).$get();
				if (i < 0 || j < i || j > str.length) {
					$panic(new $String("reflect.Value.Slice: string slice index out of bounds"));
				}
				_r = ValueOf(new $String($substring(str, i, j))); /* */ $s = 7; case 7: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
				$s = -1; return _r;
			/* } else { */ case 5:
				$panic(new ValueError.ptr("reflect.Value.Slice", kind));
			/* } */ case 6:
		case 1:
		if (i < 0 || j < i || j > cap) {
			$panic(new $String("reflect.Value.Slice: slice index out of bounds"));
		}
		_r$1 = makeValue(typ, $subslice(s, i, j), (v.flag & 96) >>> 0); /* */ $s = 8; case 8: if($c) { $c = false; _r$1 = _r$1.$blk(); } if (_r$1 && _r$1.$blk !== undefined) { break s; }
		$s = -1; return _r$1;
		/* */ } return; } if ($f === undefined) { $f = { $blk: Value.ptr.prototype.Slice }; } $f.$ptr = $ptr; $f._1 = _1; $f._r = _r; $f._r$1 = _r$1; $f.cap = cap; $f.i = i; $f.j = j; $f.kind = kind; $f.s = s; $f.str = str; $f.tt = tt; $f.typ = typ; $f.v = v; $f.$s = $s; $f.$r = $r; return $f;
	};
	Value.prototype.Slice = function(i, j) { return this.$val.Slice(i, j); };
	Value.ptr.prototype.Slice3 = function(i, j, k) {
		var $ptr, _1, _r, cap, i, j, k, kind, s, tt, typ, v, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; $ptr = $f.$ptr; _1 = $f._1; _r = $f._r; cap = $f.cap; i = $f.i; j = $f.j; k = $f.k; kind = $f.kind; s = $f.s; tt = $f.tt; typ = $f.typ; v = $f.v; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		v = this;
		cap = 0;
		typ = $ifaceNil;
		s = null;
		kind = new flag(v.flag).kind();
		_1 = kind;
		if (_1 === (17)) {
			if (((v.flag & 256) >>> 0) === 0) {
				$panic(new $String("reflect.Value.Slice: slice of unaddressable array"));
			}
			tt = (v.typ.kindType);
			cap = ((tt.len >> 0));
			typ = SliceOf(tt.elem);
			s = new (jsType(typ))($clone(v, Value).object());
		} else if (_1 === (23)) {
			typ = v.typ;
			s = $clone(v, Value).object();
			cap = $parseInt(s.$capacity) >> 0;
		} else {
			$panic(new ValueError.ptr("reflect.Value.Slice3", kind));
		}
		if (i < 0 || j < i || k < j || k > cap) {
			$panic(new $String("reflect.Value.Slice3: slice index out of bounds"));
		}
		_r = makeValue(typ, $subslice(s, i, j, k), (v.flag & 96) >>> 0); /* */ $s = 1; case 1: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
		$s = -1; return _r;
		/* */ } return; } if ($f === undefined) { $f = { $blk: Value.ptr.prototype.Slice3 }; } $f.$ptr = $ptr; $f._1 = _1; $f._r = _r; $f.cap = cap; $f.i = i; $f.j = j; $f.k = k; $f.kind = kind; $f.s = s; $f.tt = tt; $f.typ = typ; $f.v = v; $f.$s = $s; $f.$r = $r; return $f;
	};
	Value.prototype.Slice3 = function(i, j, k) { return this.$val.Slice3(i, j, k); };
	Value.ptr.prototype.Close = function() {
		var $ptr, v;
		v = this;
		new flag(v.flag).mustBe(18);
		new flag(v.flag).mustBeExported();
		$close($clone(v, Value).object());
	};
	Value.prototype.Close = function() { return this.$val.Close(); };
	chanrecv = function(t, ch, nb, val) {
		var $ptr, _r, _tmp, _tmp$1, _tmp$2, _tmp$3, ch, comms, nb, received, recvRes, selectRes, selected, t, val, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; $ptr = $f.$ptr; _r = $f._r; _tmp = $f._tmp; _tmp$1 = $f._tmp$1; _tmp$2 = $f._tmp$2; _tmp$3 = $f._tmp$3; ch = $f.ch; comms = $f.comms; nb = $f.nb; received = $f.received; recvRes = $f.recvRes; selectRes = $f.selectRes; selected = $f.selected; t = $f.t; val = $f.val; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		selected = false;
		received = false;
		comms = new sliceType$12([new sliceType$9([ch])]);
		if (nb) {
			comms = $append(comms, new sliceType$9([]));
		}
		_r = selectHelper(new sliceType$5([comms])); /* */ $s = 1; case 1: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
		selectRes = _r;
		if (nb && (($parseInt(selectRes[0]) >> 0) === 1)) {
			_tmp = false;
			_tmp$1 = false;
			selected = _tmp;
			received = _tmp$1;
			$s = -1; return [selected, received];
		}
		recvRes = selectRes[1];
		val.$set(recvRes[0]);
		_tmp$2 = true;
		_tmp$3 = !!(recvRes[1]);
		selected = _tmp$2;
		received = _tmp$3;
		$s = -1; return [selected, received];
		/* */ } return; } if ($f === undefined) { $f = { $blk: chanrecv }; } $f.$ptr = $ptr; $f._r = _r; $f._tmp = _tmp; $f._tmp$1 = _tmp$1; $f._tmp$2 = _tmp$2; $f._tmp$3 = _tmp$3; $f.ch = ch; $f.comms = comms; $f.nb = nb; $f.received = received; $f.recvRes = recvRes; $f.selectRes = selectRes; $f.selected = selected; $f.t = t; $f.val = val; $f.$s = $s; $f.$r = $r; return $f;
	};
	chansend = function(t, ch, val, nb) {
		var $ptr, _r, ch, comms, nb, selectRes, t, val, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; $ptr = $f.$ptr; _r = $f._r; ch = $f.ch; comms = $f.comms; nb = $f.nb; selectRes = $f.selectRes; t = $f.t; val = $f.val; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		comms = new sliceType$12([new sliceType$9([ch, val.$get()])]);
		if (nb) {
			comms = $append(comms, new sliceType$9([]));
		}
		_r = selectHelper(new sliceType$5([comms])); /* */ $s = 1; case 1: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
		selectRes = _r;
		if (nb && (($parseInt(selectRes[0]) >> 0) === 1)) {
			$s = -1; return false;
		}
		$s = -1; return true;
		/* */ } return; } if ($f === undefined) { $f = { $blk: chansend }; } $f.$ptr = $ptr; $f._r = _r; $f.ch = ch; $f.comms = comms; $f.nb = nb; $f.selectRes = selectRes; $f.t = t; $f.val = val; $f.$s = $s; $f.$r = $r; return $f;
	};
	Kind.prototype.String = function() {
		var $ptr, k;
		k = this.$val;
		if (((k >> 0)) < kindNames.$length) {
			return ((k < 0 || k >= kindNames.$length) ? ($throwRuntimeError("index out of range"), undefined) : kindNames.$array[kindNames.$offset + k]);
		}
		return "kind" + strconv.Itoa(((k >> 0)));
	};
	$ptrType(Kind).prototype.String = function() { return new Kind(this.$get()).String(); };
	rtype.ptr.prototype.String = function() {
		var $ptr, s, t;
		t = this;
		s = $clone(t.nameOff(t.str), name).name();
		if (!((((t.tflag & 2) >>> 0) === 0))) {
			return $substring(s, 1);
		}
		return s;
	};
	rtype.prototype.String = function() { return this.$val.String(); };
	rtype.ptr.prototype.Size = function() {
		var $ptr, t;
		t = this;
		return t.size;
	};
	rtype.prototype.Size = function() { return this.$val.Size(); };
	rtype.ptr.prototype.Bits = function() {
		var $ptr, k, t;
		t = this;
		if (t === ptrType$1.nil) {
			$panic(new $String("reflect: Bits of nil Type"));
		}
		k = t.Kind();
		if (k < 2 || k > 16) {
			$panic(new $String("reflect: Bits of non-arithmetic Type " + t.String()));
		}
		return $imul(((t.size >> 0)), 8);
	};
	rtype.prototype.Bits = function() { return this.$val.Bits(); };
	rtype.ptr.prototype.Align = function() {
		var $ptr, t;
		t = this;
		return ((t.align >> 0));
	};
	rtype.prototype.Align = function() { return this.$val.Align(); };
	rtype.ptr.prototype.FieldAlign = function() {
		var $ptr, t;
		t = this;
		return ((t.fieldAlign >> 0));
	};
	rtype.prototype.FieldAlign = function() { return this.$val.FieldAlign(); };
	rtype.ptr.prototype.Kind = function() {
		var $ptr, t;
		t = this;
		return ((((t.kind & 31) >>> 0) >>> 0));
	};
	rtype.prototype.Kind = function() { return this.$val.Kind(); };
	rtype.ptr.prototype.common = function() {
		var $ptr, t;
		t = this;
		return t;
	};
	rtype.prototype.common = function() { return this.$val.common(); };
	rtype.ptr.prototype.exportedMethods = function() {
		var $ptr, _entry, _i, _i$1, _key, _ref, _ref$1, _tuple, allExported, allm, found, m, m$1, methods, name$1, name$2, t, ut, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; $ptr = $f.$ptr; _entry = $f._entry; _i = $f._i; _i$1 = $f._i$1; _key = $f._key; _ref = $f._ref; _ref$1 = $f._ref$1; _tuple = $f._tuple; allExported = $f.allExported; allm = $f.allm; found = $f.found; m = $f.m; m$1 = $f.m$1; methods = $f.methods; name$1 = $f.name$1; name$2 = $f.name$2; t = $f.t; ut = $f.ut; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		t = this;
		$r = methodCache.RWMutex.RLock(); /* */ $s = 1; case 1: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
		_tuple = (_entry = methodCache.m[ptrType$1.keyFor(t)], _entry !== undefined ? [_entry.v, true] : [sliceType$3.nil, false]);
		methods = _tuple[0];
		found = _tuple[1];
		$r = methodCache.RWMutex.RUnlock(); /* */ $s = 2; case 2: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
		if (found) {
			$s = -1; return methods;
		}
		ut = t.uncommon();
		if (ut === ptrType$6.nil) {
			$s = -1; return sliceType$3.nil;
		}
		allm = ut.methods();
		allExported = true;
		_ref = allm;
		_i = 0;
		while (true) {
			if (!(_i < _ref.$length)) { break; }
			m = $clone(((_i < 0 || _i >= _ref.$length) ? ($throwRuntimeError("index out of range"), undefined) : _ref.$array[_ref.$offset + _i]), method);
			name$1 = $clone(t.nameOff(m.name), name);
			if (!$clone(name$1, name).isExported()) {
				allExported = false;
				break;
			}
			_i++;
		}
		if (allExported) {
			methods = allm;
		} else {
			methods = $makeSlice(sliceType$3, 0, allm.$length);
			_ref$1 = allm;
			_i$1 = 0;
			while (true) {
				if (!(_i$1 < _ref$1.$length)) { break; }
				m$1 = $clone(((_i$1 < 0 || _i$1 >= _ref$1.$length) ? ($throwRuntimeError("index out of range"), undefined) : _ref$1.$array[_ref$1.$offset + _i$1]), method);
				name$2 = $clone(t.nameOff(m$1.name), name);
				if ($clone(name$2, name).isExported()) {
					methods = $append(methods, m$1);
				}
				_i$1++;
			}
			methods = $subslice(methods, 0, methods.$length, methods.$length);
		}
		$r = methodCache.RWMutex.Lock(); /* */ $s = 3; case 3: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
		if (methodCache.m === false) {
			methodCache.m = {};
		}
		_key = t; (methodCache.m || $throwRuntimeError("assignment to entry in nil map"))[ptrType$1.keyFor(_key)] = { k: _key, v: methods };
		$r = methodCache.RWMutex.Unlock(); /* */ $s = 4; case 4: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
		$s = -1; return methods;
		/* */ } return; } if ($f === undefined) { $f = { $blk: rtype.ptr.prototype.exportedMethods }; } $f.$ptr = $ptr; $f._entry = _entry; $f._i = _i; $f._i$1 = _i$1; $f._key = _key; $f._ref = _ref; $f._ref$1 = _ref$1; $f._tuple = _tuple; $f.allExported = allExported; $f.allm = allm; $f.found = found; $f.m = m; $f.m$1 = m$1; $f.methods = methods; $f.name$1 = name$1; $f.name$2 = name$2; $f.t = t; $f.ut = ut; $f.$s = $s; $f.$r = $r; return $f;
	};
	rtype.prototype.exportedMethods = function() { return this.$val.exportedMethods(); };
	rtype.ptr.prototype.NumMethod = function() {
		var $ptr, _r, t, tt, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; $ptr = $f.$ptr; _r = $f._r; t = $f.t; tt = $f.tt; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		t = this;
		if (t.Kind() === 20) {
			tt = (t.kindType);
			$s = -1; return tt.NumMethod();
		}
		if (((t.tflag & 1) >>> 0) === 0) {
			$s = -1; return 0;
		}
		_r = t.exportedMethods(); /* */ $s = 1; case 1: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
		$s = -1; return _r.$length;
		/* */ } return; } if ($f === undefined) { $f = { $blk: rtype.ptr.prototype.NumMethod }; } $f.$ptr = $ptr; $f._r = _r; $f.t = t; $f.tt = tt; $f.$s = $s; $f.$r = $r; return $f;
	};
	rtype.prototype.NumMethod = function() { return this.$val.NumMethod(); };
	rtype.ptr.prototype.MethodByName = function(name$1) {
		var $ptr, _r, _tmp, _tmp$1, _tmp$2, _tmp$3, _tmp$4, _tmp$5, _tuple, i, m, name$1, ok, p, pname, t, tt, ut, utmethods, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; $ptr = $f.$ptr; _r = $f._r; _tmp = $f._tmp; _tmp$1 = $f._tmp$1; _tmp$2 = $f._tmp$2; _tmp$3 = $f._tmp$3; _tmp$4 = $f._tmp$4; _tmp$5 = $f._tmp$5; _tuple = $f._tuple; i = $f.i; m = $f.m; name$1 = $f.name$1; ok = $f.ok; p = $f.p; pname = $f.pname; t = $f.t; tt = $f.tt; ut = $f.ut; utmethods = $f.utmethods; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		m = new Method.ptr("", "", $ifaceNil, new Value.ptr(ptrType$1.nil, 0, 0), 0);
		ok = false;
		t = this;
		if (t.Kind() === 20) {
			tt = (t.kindType);
			_tuple = tt.MethodByName(name$1);
			Method.copy(m, _tuple[0]);
			ok = _tuple[1];
			$s = -1; return [m, ok];
		}
		ut = t.uncommon();
		if (ut === ptrType$6.nil) {
			_tmp = new Method.ptr("", "", $ifaceNil, new Value.ptr(ptrType$1.nil, 0, 0), 0);
			_tmp$1 = false;
			Method.copy(m, _tmp);
			ok = _tmp$1;
			$s = -1; return [m, ok];
		}
		utmethods = ut.methods();
		i = 0;
		/* while (true) { */ case 1:
			/* if (!(i < ((ut.mcount >> 0)))) { break; } */ if(!(i < ((ut.mcount >> 0)))) { $s = 2; continue; }
			p = $clone(((i < 0 || i >= utmethods.$length) ? ($throwRuntimeError("index out of range"), undefined) : utmethods.$array[utmethods.$offset + i]), method);
			pname = $clone(t.nameOff(p.name), name);
			/* */ if ($clone(pname, name).isExported() && $clone(pname, name).name() === name$1) { $s = 3; continue; }
			/* */ $s = 4; continue;
			/* if ($clone(pname, name).isExported() && $clone(pname, name).name() === name$1) { */ case 3:
				_r = t.Method(i); /* */ $s = 5; case 5: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
				_tmp$2 = $clone(_r, Method);
				_tmp$3 = true;
				Method.copy(m, _tmp$2);
				ok = _tmp$3;
				$s = -1; return [m, ok];
			/* } */ case 4:
			i = i + (1) >> 0;
		/* } */ $s = 1; continue; case 2:
		_tmp$4 = new Method.ptr("", "", $ifaceNil, new Value.ptr(ptrType$1.nil, 0, 0), 0);
		_tmp$5 = false;
		Method.copy(m, _tmp$4);
		ok = _tmp$5;
		$s = -1; return [m, ok];
		/* */ } return; } if ($f === undefined) { $f = { $blk: rtype.ptr.prototype.MethodByName }; } $f.$ptr = $ptr; $f._r = _r; $f._tmp = _tmp; $f._tmp$1 = _tmp$1; $f._tmp$2 = _tmp$2; $f._tmp$3 = _tmp$3; $f._tmp$4 = _tmp$4; $f._tmp$5 = _tmp$5; $f._tuple = _tuple; $f.i = i; $f.m = m; $f.name$1 = name$1; $f.ok = ok; $f.p = p; $f.pname = pname; $f.t = t; $f.tt = tt; $f.ut = ut; $f.utmethods = utmethods; $f.$s = $s; $f.$r = $r; return $f;
	};
	rtype.prototype.MethodByName = function(name$1) { return this.$val.MethodByName(name$1); };
	rtype.ptr.prototype.PkgPath = function() {
		var $ptr, t, ut;
		t = this;
		if (((t.tflag & 4) >>> 0) === 0) {
			return "";
		}
		ut = t.uncommon();
		if (ut === ptrType$6.nil) {
			return "";
		}
		return $clone(t.nameOff(ut.pkgPath), name).name();
	};
	rtype.prototype.PkgPath = function() { return this.$val.PkgPath(); };
	rtype.ptr.prototype.Name = function() {
		var $ptr, i, s, t;
		t = this;
		if (((t.tflag & 4) >>> 0) === 0) {
			return "";
		}
		s = t.String();
		i = s.length - 1 >> 0;
		while (true) {
			if (!(i >= 0)) { break; }
			if (s.charCodeAt(i) === 46) {
				break;
			}
			i = i - (1) >> 0;
		}
		return $substring(s, (i + 1 >> 0));
	};
	rtype.prototype.Name = function() { return this.$val.Name(); };
	rtype.ptr.prototype.ChanDir = function() {
		var $ptr, t, tt;
		t = this;
		if (!((t.Kind() === 18))) {
			$panic(new $String("reflect: ChanDir of non-chan type"));
		}
		tt = (t.kindType);
		return ((tt.dir >> 0));
	};
	rtype.prototype.ChanDir = function() { return this.$val.ChanDir(); };
	rtype.ptr.prototype.IsVariadic = function() {
		var $ptr, t, tt;
		t = this;
		if (!((t.Kind() === 19))) {
			$panic(new $String("reflect: IsVariadic of non-func type"));
		}
		tt = (t.kindType);
		return !((((tt.outCount & 32768) >>> 0) === 0));
	};
	rtype.prototype.IsVariadic = function() { return this.$val.IsVariadic(); };
	rtype.ptr.prototype.Elem = function() {
		var $ptr, _1, t, tt, tt$1, tt$2, tt$3, tt$4;
		t = this;
		_1 = t.Kind();
		if (_1 === (17)) {
			tt = (t.kindType);
			return toType(tt.elem);
		} else if (_1 === (18)) {
			tt$1 = (t.kindType);
			return toType(tt$1.elem);
		} else if (_1 === (21)) {
			tt$2 = (t.kindType);
			return toType(tt$2.elem);
		} else if (_1 === (22)) {
			tt$3 = (t.kindType);
			return toType(tt$3.elem);
		} else if (_1 === (23)) {
			tt$4 = (t.kindType);
			return toType(tt$4.elem);
		}
		$panic(new $String("reflect: Elem of invalid type"));
	};
	rtype.prototype.Elem = function() { return this.$val.Elem(); };
	rtype.ptr.prototype.Field = function(i) {
		var $ptr, _r, i, t, tt, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; $ptr = $f.$ptr; _r = $f._r; i = $f.i; t = $f.t; tt = $f.tt; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		t = this;
		if (!((t.Kind() === 25))) {
			$panic(new $String("reflect: Field of non-struct type"));
		}
		tt = (t.kindType);
		_r = tt.Field(i); /* */ $s = 1; case 1: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
		$s = -1; return _r;
		/* */ } return; } if ($f === undefined) { $f = { $blk: rtype.ptr.prototype.Field }; } $f.$ptr = $ptr; $f._r = _r; $f.i = i; $f.t = t; $f.tt = tt; $f.$s = $s; $f.$r = $r; return $f;
	};
	rtype.prototype.Field = function(i) { return this.$val.Field(i); };
	rtype.ptr.prototype.FieldByIndex = function(index) {
		var $ptr, _r, index, t, tt, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; $ptr = $f.$ptr; _r = $f._r; index = $f.index; t = $f.t; tt = $f.tt; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		t = this;
		if (!((t.Kind() === 25))) {
			$panic(new $String("reflect: FieldByIndex of non-struct type"));
		}
		tt = (t.kindType);
		_r = tt.FieldByIndex(index); /* */ $s = 1; case 1: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
		$s = -1; return _r;
		/* */ } return; } if ($f === undefined) { $f = { $blk: rtype.ptr.prototype.FieldByIndex }; } $f.$ptr = $ptr; $f._r = _r; $f.index = index; $f.t = t; $f.tt = tt; $f.$s = $s; $f.$r = $r; return $f;
	};
	rtype.prototype.FieldByIndex = function(index) { return this.$val.FieldByIndex(index); };
	rtype.ptr.prototype.FieldByName = function(name$1) {
		var $ptr, _r, name$1, t, tt, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; $ptr = $f.$ptr; _r = $f._r; name$1 = $f.name$1; t = $f.t; tt = $f.tt; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		t = this;
		if (!((t.Kind() === 25))) {
			$panic(new $String("reflect: FieldByName of non-struct type"));
		}
		tt = (t.kindType);
		_r = tt.FieldByName(name$1); /* */ $s = 1; case 1: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
		$s = -1; return _r;
		/* */ } return; } if ($f === undefined) { $f = { $blk: rtype.ptr.prototype.FieldByName }; } $f.$ptr = $ptr; $f._r = _r; $f.name$1 = name$1; $f.t = t; $f.tt = tt; $f.$s = $s; $f.$r = $r; return $f;
	};
	rtype.prototype.FieldByName = function(name$1) { return this.$val.FieldByName(name$1); };
	rtype.ptr.prototype.FieldByNameFunc = function(match) {
		var $ptr, _r, match, t, tt, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; $ptr = $f.$ptr; _r = $f._r; match = $f.match; t = $f.t; tt = $f.tt; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		t = this;
		if (!((t.Kind() === 25))) {
			$panic(new $String("reflect: FieldByNameFunc of non-struct type"));
		}
		tt = (t.kindType);
		_r = tt.FieldByNameFunc(match); /* */ $s = 1; case 1: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
		$s = -1; return _r;
		/* */ } return; } if ($f === undefined) { $f = { $blk: rtype.ptr.prototype.FieldByNameFunc }; } $f.$ptr = $ptr; $f._r = _r; $f.match = match; $f.t = t; $f.tt = tt; $f.$s = $s; $f.$r = $r; return $f;
	};
	rtype.prototype.FieldByNameFunc = function(match) { return this.$val.FieldByNameFunc(match); };
	rtype.ptr.prototype.In = function(i) {
		var $ptr, i, t, tt, x;
		t = this;
		if (!((t.Kind() === 19))) {
			$panic(new $String("reflect: In of non-func type"));
		}
		tt = (t.kindType);
		return toType((x = tt.in$(), ((i < 0 || i >= x.$length) ? ($throwRuntimeError("index out of range"), undefined) : x.$array[x.$offset + i])));
	};
	rtype.prototype.In = function(i) { return this.$val.In(i); };
	rtype.ptr.prototype.Key = function() {
		var $ptr, t, tt;
		t = this;
		if (!((t.Kind() === 21))) {
			$panic(new $String("reflect: Key of non-map type"));
		}
		tt = (t.kindType);
		return toType(tt.key);
	};
	rtype.prototype.Key = function() { return this.$val.Key(); };
	rtype.ptr.prototype.Len = function() {
		var $ptr, t, tt;
		t = this;
		if (!((t.Kind() === 17))) {
			$panic(new $String("reflect: Len of non-array type"));
		}
		tt = (t.kindType);
		return ((tt.len >> 0));
	};
	rtype.prototype.Len = function() { return this.$val.Len(); };
	rtype.ptr.prototype.NumField = function() {
		var $ptr, t, tt;
		t = this;
		if (!((t.Kind() === 25))) {
			$panic(new $String("reflect: NumField of non-struct type"));
		}
		tt = (t.kindType);
		return tt.fields.$length;
	};
	rtype.prototype.NumField = function() { return this.$val.NumField(); };
	rtype.ptr.prototype.NumIn = function() {
		var $ptr, t, tt;
		t = this;
		if (!((t.Kind() === 19))) {
			$panic(new $String("reflect: NumIn of non-func type"));
		}
		tt = (t.kindType);
		return ((tt.inCount >> 0));
	};
	rtype.prototype.NumIn = function() { return this.$val.NumIn(); };
	rtype.ptr.prototype.NumOut = function() {
		var $ptr, t, tt;
		t = this;
		if (!((t.Kind() === 19))) {
			$panic(new $String("reflect: NumOut of non-func type"));
		}
		tt = (t.kindType);
		return tt.out().$length;
	};
	rtype.prototype.NumOut = function() { return this.$val.NumOut(); };
	rtype.ptr.prototype.Out = function(i) {
		var $ptr, i, t, tt, x;
		t = this;
		if (!((t.Kind() === 19))) {
			$panic(new $String("reflect: Out of non-func type"));
		}
		tt = (t.kindType);
		return toType((x = tt.out(), ((i < 0 || i >= x.$length) ? ($throwRuntimeError("index out of range"), undefined) : x.$array[x.$offset + i])));
	};
	rtype.prototype.Out = function(i) { return this.$val.Out(i); };
	ChanDir.prototype.String = function() {
		var $ptr, _1, d;
		d = this.$val;
		_1 = d;
		if (_1 === (2)) {
			return "chan<-";
		} else if (_1 === (1)) {
			return "<-chan";
		} else if (_1 === (3)) {
			return "chan";
		}
		return "ChanDir" + strconv.Itoa(((d >> 0)));
	};
	$ptrType(ChanDir).prototype.String = function() { return new ChanDir(this.$get()).String(); };
	interfaceType.ptr.prototype.Method = function(i) {
		var $ptr, i, m, p, pname, t, x;
		m = new Method.ptr("", "", $ifaceNil, new Value.ptr(ptrType$1.nil, 0, 0), 0);
		t = this;
		if (i < 0 || i >= t.methods.$length) {
			return m;
		}
		p = (x = t.methods, ((i < 0 || i >= x.$length) ? ($throwRuntimeError("index out of range"), undefined) : x.$array[x.$offset + i]));
		pname = $clone(t.rtype.nameOff(p.name), name);
		m.Name = $clone(pname, name).name();
		if (!$clone(pname, name).isExported()) {
			m.PkgPath = $clone(pname, name).pkgPath();
			if (m.PkgPath === "") {
				m.PkgPath = $clone(t.pkgPath, name).name();
			}
		}
		m.Type = toType(t.rtype.typeOff(p.typ));
		m.Index = i;
		return m;
	};
	interfaceType.prototype.Method = function(i) { return this.$val.Method(i); };
	interfaceType.ptr.prototype.NumMethod = function() {
		var $ptr, t;
		t = this;
		return t.methods.$length;
	};
	interfaceType.prototype.NumMethod = function() { return this.$val.NumMethod(); };
	interfaceType.ptr.prototype.MethodByName = function(name$1) {
		var $ptr, _i, _ref, _tmp, _tmp$1, i, m, name$1, ok, p, t, x;
		m = new Method.ptr("", "", $ifaceNil, new Value.ptr(ptrType$1.nil, 0, 0), 0);
		ok = false;
		t = this;
		if (t === ptrType$8.nil) {
			return [m, ok];
		}
		p = ptrType$9.nil;
		_ref = t.methods;
		_i = 0;
		while (true) {
			if (!(_i < _ref.$length)) { break; }
			i = _i;
			p = (x = t.methods, ((i < 0 || i >= x.$length) ? ($throwRuntimeError("index out of range"), undefined) : x.$array[x.$offset + i]));
			if ($clone(t.rtype.nameOff(p.name), name).name() === name$1) {
				_tmp = $clone(t.Method(i), Method);
				_tmp$1 = true;
				Method.copy(m, _tmp);
				ok = _tmp$1;
				return [m, ok];
			}
			_i++;
		}
		return [m, ok];
	};
	interfaceType.prototype.MethodByName = function(name$1) { return this.$val.MethodByName(name$1); };
	StructTag.prototype.Get = function(key) {
		var $ptr, _tuple, key, tag, v;
		tag = this.$val;
		_tuple = new StructTag(tag).Lookup(key);
		v = _tuple[0];
		return v;
	};
	$ptrType(StructTag).prototype.Get = function(key) { return new StructTag(this.$get()).Get(key); };
	StructTag.prototype.Lookup = function(key) {
		var $ptr, _tmp, _tmp$1, _tmp$2, _tmp$3, _tuple, err, i, key, name$1, ok, qvalue, tag, value, value$1;
		value = "";
		ok = false;
		tag = this.$val;
		while (true) {
			if (!(!(tag === ""))) { break; }
			i = 0;
			while (true) {
				if (!(i < tag.length && (tag.charCodeAt(i) === 32))) { break; }
				i = i + (1) >> 0;
			}
			tag = $substring(tag, i);
			if (tag === "") {
				break;
			}
			i = 0;
			while (true) {
				if (!(i < tag.length && tag.charCodeAt(i) > 32 && !((tag.charCodeAt(i) === 58)) && !((tag.charCodeAt(i) === 34)) && !((tag.charCodeAt(i) === 127)))) { break; }
				i = i + (1) >> 0;
			}
			if ((i === 0) || (i + 1 >> 0) >= tag.length || !((tag.charCodeAt(i) === 58)) || !((tag.charCodeAt((i + 1 >> 0)) === 34))) {
				break;
			}
			name$1 = ($substring(tag, 0, i));
			tag = $substring(tag, (i + 1 >> 0));
			i = 1;
			while (true) {
				if (!(i < tag.length && !((tag.charCodeAt(i) === 34)))) { break; }
				if (tag.charCodeAt(i) === 92) {
					i = i + (1) >> 0;
				}
				i = i + (1) >> 0;
			}
			if (i >= tag.length) {
				break;
			}
			qvalue = ($substring(tag, 0, (i + 1 >> 0)));
			tag = $substring(tag, (i + 1 >> 0));
			if (key === name$1) {
				_tuple = strconv.Unquote(qvalue);
				value$1 = _tuple[0];
				err = _tuple[1];
				if (!($interfaceIsEqual(err, $ifaceNil))) {
					break;
				}
				_tmp = value$1;
				_tmp$1 = true;
				value = _tmp;
				ok = _tmp$1;
				return [value, ok];
			}
		}
		_tmp$2 = "";
		_tmp$3 = false;
		value = _tmp$2;
		ok = _tmp$3;
		return [value, ok];
	};
	$ptrType(StructTag).prototype.Lookup = function(key) { return new StructTag(this.$get()).Lookup(key); };
	structType.ptr.prototype.Field = function(i) {
		var $ptr, _r, _r$1, _r$2, f, i, name$1, p, t, t$1, tag, x, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; $ptr = $f.$ptr; _r = $f._r; _r$1 = $f._r$1; _r$2 = $f._r$2; f = $f.f; i = $f.i; name$1 = $f.name$1; p = $f.p; t = $f.t; t$1 = $f.t$1; tag = $f.tag; x = $f.x; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		f = new StructField.ptr("", "", $ifaceNil, "", 0, sliceType$14.nil, false);
		t = this;
		if (i < 0 || i >= t.fields.$length) {
			$panic(new $String("reflect: Field index out of bounds"));
		}
		p = (x = t.fields, ((i < 0 || i >= x.$length) ? ($throwRuntimeError("index out of range"), undefined) : x.$array[x.$offset + i]));
		f.Type = toType(p.typ);
		name$1 = $clone(p.name, name).name();
		/* */ if (!(name$1 === "")) { $s = 1; continue; }
		/* */ $s = 2; continue;
		/* if (!(name$1 === "")) { */ case 1:
			f.Name = name$1;
			$s = 3; continue;
		/* } else { */ case 2:
			t$1 = f.Type;
			_r = t$1.Kind(); /* */ $s = 6; case 6: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
			/* */ if (_r === 22) { $s = 4; continue; }
			/* */ $s = 5; continue;
			/* if (_r === 22) { */ case 4:
				_r$1 = t$1.Elem(); /* */ $s = 7; case 7: if($c) { $c = false; _r$1 = _r$1.$blk(); } if (_r$1 && _r$1.$blk !== undefined) { break s; }
				t$1 = _r$1;
			/* } */ case 5:
			_r$2 = t$1.Name(); /* */ $s = 8; case 8: if($c) { $c = false; _r$2 = _r$2.$blk(); } if (_r$2 && _r$2.$blk !== undefined) { break s; }
			f.Name = _r$2;
			f.Anonymous = true;
		/* } */ case 3:
		if (!$clone(p.name, name).isExported()) {
			f.PkgPath = $clone(p.name, name).pkgPath();
			if (f.PkgPath === "") {
				f.PkgPath = $clone(t.pkgPath, name).name();
			}
		}
		tag = $clone(p.name, name).tag();
		if (!(tag === "")) {
			f.Tag = (tag);
		}
		f.Offset = p.offset;
		f.Index = new sliceType$14([i]);
		$s = -1; return f;
		/* */ } return; } if ($f === undefined) { $f = { $blk: structType.ptr.prototype.Field }; } $f.$ptr = $ptr; $f._r = _r; $f._r$1 = _r$1; $f._r$2 = _r$2; $f.f = f; $f.i = i; $f.name$1 = name$1; $f.p = p; $f.t = t; $f.t$1 = t$1; $f.tag = tag; $f.x = x; $f.$s = $s; $f.$r = $r; return $f;
	};
	structType.prototype.Field = function(i) { return this.$val.Field(i); };
	structType.ptr.prototype.FieldByIndex = function(index) {
		var $ptr, _i, _r, _r$1, _r$2, _r$3, _r$4, _ref, _v, f, ft, i, index, t, x, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; $ptr = $f.$ptr; _i = $f._i; _r = $f._r; _r$1 = $f._r$1; _r$2 = $f._r$2; _r$3 = $f._r$3; _r$4 = $f._r$4; _ref = $f._ref; _v = $f._v; f = $f.f; ft = $f.ft; i = $f.i; index = $f.index; t = $f.t; x = $f.x; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		f = new StructField.ptr("", "", $ifaceNil, "", 0, sliceType$14.nil, false);
		t = this;
		f.Type = toType(t.rtype);
		_ref = index;
		_i = 0;
		/* while (true) { */ case 1:
			/* if (!(_i < _ref.$length)) { break; } */ if(!(_i < _ref.$length)) { $s = 2; continue; }
			i = _i;
			x = ((_i < 0 || _i >= _ref.$length) ? ($throwRuntimeError("index out of range"), undefined) : _ref.$array[_ref.$offset + _i]);
			/* */ if (i > 0) { $s = 3; continue; }
			/* */ $s = 4; continue;
			/* if (i > 0) { */ case 3:
				ft = f.Type;
				_r = ft.Kind(); /* */ $s = 8; case 8: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
				if (!(_r === 22)) { _v = false; $s = 7; continue s; }
				_r$1 = ft.Elem(); /* */ $s = 9; case 9: if($c) { $c = false; _r$1 = _r$1.$blk(); } if (_r$1 && _r$1.$blk !== undefined) { break s; }
				_r$2 = _r$1.Kind(); /* */ $s = 10; case 10: if($c) { $c = false; _r$2 = _r$2.$blk(); } if (_r$2 && _r$2.$blk !== undefined) { break s; }
				_v = _r$2 === 25; case 7:
				/* */ if (_v) { $s = 5; continue; }
				/* */ $s = 6; continue;
				/* if (_v) { */ case 5:
					_r$3 = ft.Elem(); /* */ $s = 11; case 11: if($c) { $c = false; _r$3 = _r$3.$blk(); } if (_r$3 && _r$3.$blk !== undefined) { break s; }
					ft = _r$3;
				/* } */ case 6:
				f.Type = ft;
			/* } */ case 4:
			_r$4 = f.Type.Field(x); /* */ $s = 12; case 12: if($c) { $c = false; _r$4 = _r$4.$blk(); } if (_r$4 && _r$4.$blk !== undefined) { break s; }
			StructField.copy(f, _r$4);
			_i++;
		/* } */ $s = 1; continue; case 2:
		$s = -1; return f;
		/* */ } return; } if ($f === undefined) { $f = { $blk: structType.ptr.prototype.FieldByIndex }; } $f.$ptr = $ptr; $f._i = _i; $f._r = _r; $f._r$1 = _r$1; $f._r$2 = _r$2; $f._r$3 = _r$3; $f._r$4 = _r$4; $f._ref = _ref; $f._v = _v; $f.f = f; $f.ft = ft; $f.i = i; $f.index = index; $f.t = t; $f.x = x; $f.$s = $s; $f.$r = $r; return $f;
	};
	structType.prototype.FieldByIndex = function(index) { return this.$val.FieldByIndex(index); };
	structType.ptr.prototype.FieldByNameFunc = function(match) {
		var $ptr, _entry, _entry$1, _entry$2, _entry$3, _i, _i$1, _key, _key$1, _key$2, _key$3, _r, _r$1, _r$2, _ref, _ref$1, _tmp, _tmp$1, _tmp$2, _tmp$3, count, current, f, fname, i, index, match, name$1, next, nextCount, ntyp, ok, result, scan, styp, t, t$1, visited, x, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; $ptr = $f.$ptr; _entry = $f._entry; _entry$1 = $f._entry$1; _entry$2 = $f._entry$2; _entry$3 = $f._entry$3; _i = $f._i; _i$1 = $f._i$1; _key = $f._key; _key$1 = $f._key$1; _key$2 = $f._key$2; _key$3 = $f._key$3; _r = $f._r; _r$1 = $f._r$1; _r$2 = $f._r$2; _ref = $f._ref; _ref$1 = $f._ref$1; _tmp = $f._tmp; _tmp$1 = $f._tmp$1; _tmp$2 = $f._tmp$2; _tmp$3 = $f._tmp$3; count = $f.count; current = $f.current; f = $f.f; fname = $f.fname; i = $f.i; index = $f.index; match = $f.match; name$1 = $f.name$1; next = $f.next; nextCount = $f.nextCount; ntyp = $f.ntyp; ok = $f.ok; result = $f.result; scan = $f.scan; styp = $f.styp; t = $f.t; t$1 = $f.t$1; visited = $f.visited; x = $f.x; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		result = new StructField.ptr("", "", $ifaceNil, "", 0, sliceType$14.nil, false);
		ok = false;
		t = this;
		current = new sliceType$15([]);
		next = new sliceType$15([new fieldScan.ptr(t, sliceType$14.nil)]);
		nextCount = false;
		visited = $makeMap(ptrType$10.keyFor, []);
		/* while (true) { */ case 1:
			/* if (!(next.$length > 0)) { break; } */ if(!(next.$length > 0)) { $s = 2; continue; }
			_tmp = next;
			_tmp$1 = $subslice(current, 0, 0);
			current = _tmp;
			next = _tmp$1;
			count = nextCount;
			nextCount = false;
			_ref = current;
			_i = 0;
			/* while (true) { */ case 3:
				/* if (!(_i < _ref.$length)) { break; } */ if(!(_i < _ref.$length)) { $s = 4; continue; }
				scan = $clone(((_i < 0 || _i >= _ref.$length) ? ($throwRuntimeError("index out of range"), undefined) : _ref.$array[_ref.$offset + _i]), fieldScan);
				t$1 = scan.typ;
				/* */ if ((_entry = visited[ptrType$10.keyFor(t$1)], _entry !== undefined ? _entry.v : false)) { $s = 5; continue; }
				/* */ $s = 6; continue;
				/* if ((_entry = visited[ptrType$10.keyFor(t$1)], _entry !== undefined ? _entry.v : false)) { */ case 5:
					_i++;
					/* continue; */ $s = 3; continue;
				/* } */ case 6:
				_key = t$1; (visited || $throwRuntimeError("assignment to entry in nil map"))[ptrType$10.keyFor(_key)] = { k: _key, v: true };
				_ref$1 = t$1.fields;
				_i$1 = 0;
				/* while (true) { */ case 7:
					/* if (!(_i$1 < _ref$1.$length)) { break; } */ if(!(_i$1 < _ref$1.$length)) { $s = 8; continue; }
					i = _i$1;
					f = (x = t$1.fields, ((i < 0 || i >= x.$length) ? ($throwRuntimeError("index out of range"), undefined) : x.$array[x.$offset + i]));
					fname = "";
					ntyp = ptrType$1.nil;
					name$1 = $clone(f.name, name).name();
					/* */ if (!(name$1 === "")) { $s = 9; continue; }
					/* */ $s = 10; continue;
					/* if (!(name$1 === "")) { */ case 9:
						fname = name$1;
						$s = 11; continue;
					/* } else { */ case 10:
						ntyp = f.typ;
						/* */ if (ntyp.Kind() === 22) { $s = 12; continue; }
						/* */ $s = 13; continue;
						/* if (ntyp.Kind() === 22) { */ case 12:
							_r = ntyp.Elem().common(); /* */ $s = 14; case 14: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
							ntyp = _r;
						/* } */ case 13:
						fname = ntyp.Name();
					/* } */ case 11:
					_r$1 = match(fname); /* */ $s = 17; case 17: if($c) { $c = false; _r$1 = _r$1.$blk(); } if (_r$1 && _r$1.$blk !== undefined) { break s; }
					/* */ if (_r$1) { $s = 15; continue; }
					/* */ $s = 16; continue;
					/* if (_r$1) { */ case 15:
						if ((_entry$1 = count[ptrType$10.keyFor(t$1)], _entry$1 !== undefined ? _entry$1.v : 0) > 1 || ok) {
							_tmp$2 = new StructField.ptr("", "", $ifaceNil, "", 0, sliceType$14.nil, false);
							_tmp$3 = false;
							StructField.copy(result, _tmp$2);
							ok = _tmp$3;
							$s = -1; return [result, ok];
						}
						_r$2 = t$1.Field(i); /* */ $s = 18; case 18: if($c) { $c = false; _r$2 = _r$2.$blk(); } if (_r$2 && _r$2.$blk !== undefined) { break s; }
						StructField.copy(result, _r$2);
						result.Index = sliceType$14.nil;
						result.Index = $appendSlice(result.Index, scan.index);
						result.Index = $append(result.Index, i);
						ok = true;
						_i$1++;
						/* continue; */ $s = 7; continue;
					/* } */ case 16:
					if (ok || ntyp === ptrType$1.nil || !((ntyp.Kind() === 25))) {
						_i$1++;
						/* continue; */ $s = 7; continue;
					}
					styp = (ntyp.kindType);
					if ((_entry$2 = nextCount[ptrType$10.keyFor(styp)], _entry$2 !== undefined ? _entry$2.v : 0) > 0) {
						_key$1 = styp; (nextCount || $throwRuntimeError("assignment to entry in nil map"))[ptrType$10.keyFor(_key$1)] = { k: _key$1, v: 2 };
						_i$1++;
						/* continue; */ $s = 7; continue;
					}
					if (nextCount === false) {
						nextCount = $makeMap(ptrType$10.keyFor, []);
					}
					_key$2 = styp; (nextCount || $throwRuntimeError("assignment to entry in nil map"))[ptrType$10.keyFor(_key$2)] = { k: _key$2, v: 1 };
					if ((_entry$3 = count[ptrType$10.keyFor(t$1)], _entry$3 !== undefined ? _entry$3.v : 0) > 1) {
						_key$3 = styp; (nextCount || $throwRuntimeError("assignment to entry in nil map"))[ptrType$10.keyFor(_key$3)] = { k: _key$3, v: 2 };
					}
					index = sliceType$14.nil;
					index = $appendSlice(index, scan.index);
					index = $append(index, i);
					next = $append(next, new fieldScan.ptr(styp, index));
					_i$1++;
				/* } */ $s = 7; continue; case 8:
				_i++;
			/* } */ $s = 3; continue; case 4:
			if (ok) {
				/* break; */ $s = 2; continue;
			}
		/* } */ $s = 1; continue; case 2:
		$s = -1; return [result, ok];
		/* */ } return; } if ($f === undefined) { $f = { $blk: structType.ptr.prototype.FieldByNameFunc }; } $f.$ptr = $ptr; $f._entry = _entry; $f._entry$1 = _entry$1; $f._entry$2 = _entry$2; $f._entry$3 = _entry$3; $f._i = _i; $f._i$1 = _i$1; $f._key = _key; $f._key$1 = _key$1; $f._key$2 = _key$2; $f._key$3 = _key$3; $f._r = _r; $f._r$1 = _r$1; $f._r$2 = _r$2; $f._ref = _ref; $f._ref$1 = _ref$1; $f._tmp = _tmp; $f._tmp$1 = _tmp$1; $f._tmp$2 = _tmp$2; $f._tmp$3 = _tmp$3; $f.count = count; $f.current = current; $f.f = f; $f.fname = fname; $f.i = i; $f.index = index; $f.match = match; $f.name$1 = name$1; $f.next = next; $f.nextCount = nextCount; $f.ntyp = ntyp; $f.ok = ok; $f.result = result; $f.scan = scan; $f.styp = styp; $f.t = t; $f.t$1 = t$1; $f.visited = visited; $f.x = x; $f.$s = $s; $f.$r = $r; return $f;
	};
	structType.prototype.FieldByNameFunc = function(match) { return this.$val.FieldByNameFunc(match); };
	structType.ptr.prototype.FieldByName = function(name$1) {
		var $ptr, _i, _r, _r$1, _ref, _tmp, _tmp$1, _tuple, f, hasAnon, i, name$1, present, t, tf, tfname, x, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; $ptr = $f.$ptr; _i = $f._i; _r = $f._r; _r$1 = $f._r$1; _ref = $f._ref; _tmp = $f._tmp; _tmp$1 = $f._tmp$1; _tuple = $f._tuple; f = $f.f; hasAnon = $f.hasAnon; i = $f.i; name$1 = $f.name$1; present = $f.present; t = $f.t; tf = $f.tf; tfname = $f.tfname; x = $f.x; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		name$1 = [name$1];
		f = new StructField.ptr("", "", $ifaceNil, "", 0, sliceType$14.nil, false);
		present = false;
		t = this;
		hasAnon = false;
		/* */ if (!(name$1[0] === "")) { $s = 1; continue; }
		/* */ $s = 2; continue;
		/* if (!(name$1[0] === "")) { */ case 1:
			_ref = t.fields;
			_i = 0;
			/* while (true) { */ case 3:
				/* if (!(_i < _ref.$length)) { break; } */ if(!(_i < _ref.$length)) { $s = 4; continue; }
				i = _i;
				tf = (x = t.fields, ((i < 0 || i >= x.$length) ? ($throwRuntimeError("index out of range"), undefined) : x.$array[x.$offset + i]));
				tfname = $clone(tf.name, name).name();
				/* */ if (tfname === "") { $s = 5; continue; }
				/* */ $s = 6; continue;
				/* if (tfname === "") { */ case 5:
					hasAnon = true;
					_i++;
					/* continue; */ $s = 3; continue;
				/* } */ case 6:
				/* */ if (tfname === name$1[0]) { $s = 7; continue; }
				/* */ $s = 8; continue;
				/* if (tfname === name$1[0]) { */ case 7:
					_r = t.Field(i); /* */ $s = 9; case 9: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
					_tmp = $clone(_r, StructField);
					_tmp$1 = true;
					StructField.copy(f, _tmp);
					present = _tmp$1;
					$s = -1; return [f, present];
				/* } */ case 8:
				_i++;
			/* } */ $s = 3; continue; case 4:
		/* } */ case 2:
		if (!hasAnon) {
			$s = -1; return [f, present];
		}
		_r$1 = t.FieldByNameFunc((function(name$1) { return function(s) {
			var $ptr, s;
			return s === name$1[0];
		}; })(name$1)); /* */ $s = 10; case 10: if($c) { $c = false; _r$1 = _r$1.$blk(); } if (_r$1 && _r$1.$blk !== undefined) { break s; }
		_tuple = _r$1;
		StructField.copy(f, _tuple[0]);
		present = _tuple[1];
		$s = -1; return [f, present];
		/* */ } return; } if ($f === undefined) { $f = { $blk: structType.ptr.prototype.FieldByName }; } $f.$ptr = $ptr; $f._i = _i; $f._r = _r; $f._r$1 = _r$1; $f._ref = _ref; $f._tmp = _tmp; $f._tmp$1 = _tmp$1; $f._tuple = _tuple; $f.f = f; $f.hasAnon = hasAnon; $f.i = i; $f.name$1 = name$1; $f.present = present; $f.t = t; $f.tf = tf; $f.tfname = tfname; $f.x = x; $f.$s = $s; $f.$r = $r; return $f;
	};
	structType.prototype.FieldByName = function(name$1) { return this.$val.FieldByName(name$1); };
	PtrTo = function(t) {
		var $ptr, t;
		return $assertType(t, ptrType$1).ptrTo();
	};
	$pkg.PtrTo = PtrTo;
	rtype.ptr.prototype.Implements = function(u) {
		var $ptr, _r, t, u, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; $ptr = $f.$ptr; _r = $f._r; t = $f.t; u = $f.u; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		t = this;
		if ($interfaceIsEqual(u, $ifaceNil)) {
			$panic(new $String("reflect: nil type passed to Type.Implements"));
		}
		_r = u.Kind(); /* */ $s = 3; case 3: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
		/* */ if (!((_r === 20))) { $s = 1; continue; }
		/* */ $s = 2; continue;
		/* if (!((_r === 20))) { */ case 1:
			$panic(new $String("reflect: non-interface type passed to Type.Implements"));
		/* } */ case 2:
		$s = -1; return implements$1($assertType(u, ptrType$1), t);
		/* */ } return; } if ($f === undefined) { $f = { $blk: rtype.ptr.prototype.Implements }; } $f.$ptr = $ptr; $f._r = _r; $f.t = t; $f.u = u; $f.$s = $s; $f.$r = $r; return $f;
	};
	rtype.prototype.Implements = function(u) { return this.$val.Implements(u); };
	rtype.ptr.prototype.AssignableTo = function(u) {
		var $ptr, _r, t, u, uu, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; $ptr = $f.$ptr; _r = $f._r; t = $f.t; u = $f.u; uu = $f.uu; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		t = this;
		if ($interfaceIsEqual(u, $ifaceNil)) {
			$panic(new $String("reflect: nil type passed to Type.AssignableTo"));
		}
		uu = $assertType(u, ptrType$1);
		_r = directlyAssignable(uu, t); /* */ $s = 1; case 1: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
		$s = -1; return _r || implements$1(uu, t);
		/* */ } return; } if ($f === undefined) { $f = { $blk: rtype.ptr.prototype.AssignableTo }; } $f.$ptr = $ptr; $f._r = _r; $f.t = t; $f.u = u; $f.uu = uu; $f.$s = $s; $f.$r = $r; return $f;
	};
	rtype.prototype.AssignableTo = function(u) { return this.$val.AssignableTo(u); };
	rtype.ptr.prototype.ConvertibleTo = function(u) {
		var $ptr, _r, t, u, uu, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; $ptr = $f.$ptr; _r = $f._r; t = $f.t; u = $f.u; uu = $f.uu; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		t = this;
		if ($interfaceIsEqual(u, $ifaceNil)) {
			$panic(new $String("reflect: nil type passed to Type.ConvertibleTo"));
		}
		uu = $assertType(u, ptrType$1);
		_r = convertOp(uu, t); /* */ $s = 1; case 1: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
		$s = -1; return !(_r === $throwNilPointerError);
		/* */ } return; } if ($f === undefined) { $f = { $blk: rtype.ptr.prototype.ConvertibleTo }; } $f.$ptr = $ptr; $f._r = _r; $f.t = t; $f.u = u; $f.uu = uu; $f.$s = $s; $f.$r = $r; return $f;
	};
	rtype.prototype.ConvertibleTo = function(u) { return this.$val.ConvertibleTo(u); };
	implements$1 = function(T, V) {
		var $ptr, T, V, i, i$1, j, j$1, t, tm, tm$1, v, v$1, vm, vm$1, vmethods, x, x$1, x$2;
		if (!((T.Kind() === 20))) {
			return false;
		}
		t = (T.kindType);
		if (t.methods.$length === 0) {
			return true;
		}
		if (V.Kind() === 20) {
			v = (V.kindType);
			i = 0;
			j = 0;
			while (true) {
				if (!(j < v.methods.$length)) { break; }
				tm = (x = t.methods, ((i < 0 || i >= x.$length) ? ($throwRuntimeError("index out of range"), undefined) : x.$array[x.$offset + i]));
				vm = (x$1 = v.methods, ((j < 0 || j >= x$1.$length) ? ($throwRuntimeError("index out of range"), undefined) : x$1.$array[x$1.$offset + j]));
				if ($clone(V.nameOff(vm.name), name).name() === $clone(t.rtype.nameOff(tm.name), name).name() && V.typeOff(vm.typ) === t.rtype.typeOff(tm.typ)) {
					i = i + (1) >> 0;
					if (i >= t.methods.$length) {
						return true;
					}
				}
				j = j + (1) >> 0;
			}
			return false;
		}
		v$1 = V.uncommon();
		if (v$1 === ptrType$6.nil) {
			return false;
		}
		i$1 = 0;
		vmethods = v$1.methods();
		j$1 = 0;
		while (true) {
			if (!(j$1 < ((v$1.mcount >> 0)))) { break; }
			tm$1 = (x$2 = t.methods, ((i$1 < 0 || i$1 >= x$2.$length) ? ($throwRuntimeError("index out of range"), undefined) : x$2.$array[x$2.$offset + i$1]));
			vm$1 = $clone(((j$1 < 0 || j$1 >= vmethods.$length) ? ($throwRuntimeError("index out of range"), undefined) : vmethods.$array[vmethods.$offset + j$1]), method);
			if ($clone(V.nameOff(vm$1.name), name).name() === $clone(t.rtype.nameOff(tm$1.name), name).name() && V.typeOff(vm$1.mtyp) === t.rtype.typeOff(tm$1.typ)) {
				i$1 = i$1 + (1) >> 0;
				if (i$1 >= t.methods.$length) {
					return true;
				}
			}
			j$1 = j$1 + (1) >> 0;
		}
		return false;
	};
	directlyAssignable = function(T, V) {
		var $ptr, T, V, _r, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; $ptr = $f.$ptr; T = $f.T; V = $f.V; _r = $f._r; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		if (T === V) {
			$s = -1; return true;
		}
		if (!(T.Name() === "") && !(V.Name() === "") || !((T.Kind() === V.Kind()))) {
			$s = -1; return false;
		}
		_r = haveIdenticalUnderlyingType(T, V, true); /* */ $s = 1; case 1: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
		$s = -1; return _r;
		/* */ } return; } if ($f === undefined) { $f = { $blk: directlyAssignable }; } $f.$ptr = $ptr; $f.T = T; $f.V = V; $f._r = _r; $f.$s = $s; $f.$r = $r; return $f;
	};
	haveIdenticalType = function(T, V, cmpTags) {
		var $ptr, T, V, _arg, _arg$1, _r, _r$1, _r$2, _r$3, _r$4, _r$5, _r$6, _v, cmpTags, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; $ptr = $f.$ptr; T = $f.T; V = $f.V; _arg = $f._arg; _arg$1 = $f._arg$1; _r = $f._r; _r$1 = $f._r$1; _r$2 = $f._r$2; _r$3 = $f._r$3; _r$4 = $f._r$4; _r$5 = $f._r$5; _r$6 = $f._r$6; _v = $f._v; cmpTags = $f.cmpTags; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		if (cmpTags) {
			$s = -1; return $interfaceIsEqual(T, V);
		}
		_r = T.Name(); /* */ $s = 4; case 4: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
		_r$1 = V.Name(); /* */ $s = 5; case 5: if($c) { $c = false; _r$1 = _r$1.$blk(); } if (_r$1 && _r$1.$blk !== undefined) { break s; }
		if (!(_r === _r$1)) { _v = true; $s = 3; continue s; }
		_r$2 = T.Kind(); /* */ $s = 6; case 6: if($c) { $c = false; _r$2 = _r$2.$blk(); } if (_r$2 && _r$2.$blk !== undefined) { break s; }
		_r$3 = V.Kind(); /* */ $s = 7; case 7: if($c) { $c = false; _r$3 = _r$3.$blk(); } if (_r$3 && _r$3.$blk !== undefined) { break s; }
		_v = !((_r$2 === _r$3)); case 3:
		/* */ if (_v) { $s = 1; continue; }
		/* */ $s = 2; continue;
		/* if (_v) { */ case 1:
			$s = -1; return false;
		/* } */ case 2:
		_r$4 = T.common(); /* */ $s = 8; case 8: if($c) { $c = false; _r$4 = _r$4.$blk(); } if (_r$4 && _r$4.$blk !== undefined) { break s; }
		_arg = _r$4;
		_r$5 = V.common(); /* */ $s = 9; case 9: if($c) { $c = false; _r$5 = _r$5.$blk(); } if (_r$5 && _r$5.$blk !== undefined) { break s; }
		_arg$1 = _r$5;
		_r$6 = haveIdenticalUnderlyingType(_arg, _arg$1, false); /* */ $s = 10; case 10: if($c) { $c = false; _r$6 = _r$6.$blk(); } if (_r$6 && _r$6.$blk !== undefined) { break s; }
		$s = -1; return _r$6;
		/* */ } return; } if ($f === undefined) { $f = { $blk: haveIdenticalType }; } $f.$ptr = $ptr; $f.T = T; $f.V = V; $f._arg = _arg; $f._arg$1 = _arg$1; $f._r = _r; $f._r$1 = _r$1; $f._r$2 = _r$2; $f._r$3 = _r$3; $f._r$4 = _r$4; $f._r$5 = _r$5; $f._r$6 = _r$6; $f._v = _v; $f.cmpTags = cmpTags; $f.$s = $s; $f.$r = $r; return $f;
	};
	haveIdenticalUnderlyingType = function(T, V, cmpTags) {
		var $ptr, T, V, _1, _i, _r, _r$1, _r$2, _r$3, _r$4, _r$5, _r$6, _r$7, _r$8, _ref, _v, _v$1, _v$2, _v$3, cmpTags, i, i$1, i$2, kind, t, t$1, t$2, tf, tp, v, v$1, v$2, vf, vp, x, x$1, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; $ptr = $f.$ptr; T = $f.T; V = $f.V; _1 = $f._1; _i = $f._i; _r = $f._r; _r$1 = $f._r$1; _r$2 = $f._r$2; _r$3 = $f._r$3; _r$4 = $f._r$4; _r$5 = $f._r$5; _r$6 = $f._r$6; _r$7 = $f._r$7; _r$8 = $f._r$8; _ref = $f._ref; _v = $f._v; _v$1 = $f._v$1; _v$2 = $f._v$2; _v$3 = $f._v$3; cmpTags = $f.cmpTags; i = $f.i; i$1 = $f.i$1; i$2 = $f.i$2; kind = $f.kind; t = $f.t; t$1 = $f.t$1; t$2 = $f.t$2; tf = $f.tf; tp = $f.tp; v = $f.v; v$1 = $f.v$1; v$2 = $f.v$2; vf = $f.vf; vp = $f.vp; x = $f.x; x$1 = $f.x$1; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		if (T === V) {
			$s = -1; return true;
		}
		kind = T.Kind();
		if (!((kind === V.Kind()))) {
			$s = -1; return false;
		}
		if (1 <= kind && kind <= 16 || (kind === 24) || (kind === 26)) {
			$s = -1; return true;
		}
			_1 = kind;
			/* */ if (_1 === (17)) { $s = 2; continue; }
			/* */ if (_1 === (18)) { $s = 3; continue; }
			/* */ if (_1 === (19)) { $s = 4; continue; }
			/* */ if (_1 === (20)) { $s = 5; continue; }
			/* */ if (_1 === (21)) { $s = 6; continue; }
			/* */ if ((_1 === (22)) || (_1 === (23))) { $s = 7; continue; }
			/* */ if (_1 === (25)) { $s = 8; continue; }
			/* */ $s = 9; continue;
			/* if (_1 === (17)) { */ case 2:
				if (!(T.Len() === V.Len())) { _v = false; $s = 10; continue s; }
				_r = haveIdenticalType(T.Elem(), V.Elem(), cmpTags); /* */ $s = 11; case 11: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
				_v = _r; case 10:
				$s = -1; return _v;
			/* } else if (_1 === (18)) { */ case 3:
				if (!(V.ChanDir() === 3)) { _v$1 = false; $s = 14; continue s; }
				_r$1 = haveIdenticalType(T.Elem(), V.Elem(), cmpTags); /* */ $s = 15; case 15: if($c) { $c = false; _r$1 = _r$1.$blk(); } if (_r$1 && _r$1.$blk !== undefined) { break s; }
				_v$1 = _r$1; case 14:
				/* */ if (_v$1) { $s = 12; continue; }
				/* */ $s = 13; continue;
				/* if (_v$1) { */ case 12:
					$s = -1; return true;
				/* } */ case 13:
				if (!(V.ChanDir() === T.ChanDir())) { _v$2 = false; $s = 16; continue s; }
				_r$2 = haveIdenticalType(T.Elem(), V.Elem(), cmpTags); /* */ $s = 17; case 17: if($c) { $c = false; _r$2 = _r$2.$blk(); } if (_r$2 && _r$2.$blk !== undefined) { break s; }
				_v$2 = _r$2; case 16:
				$s = -1; return _v$2;
			/* } else if (_1 === (19)) { */ case 4:
				t = (T.kindType);
				v = (V.kindType);
				if (!((t.outCount === v.outCount)) || !((t.inCount === v.inCount))) {
					$s = -1; return false;
				}
				i = 0;
				/* while (true) { */ case 18:
					/* if (!(i < t.rtype.NumIn())) { break; } */ if(!(i < t.rtype.NumIn())) { $s = 19; continue; }
					_r$3 = haveIdenticalType(t.rtype.In(i), v.rtype.In(i), cmpTags); /* */ $s = 22; case 22: if($c) { $c = false; _r$3 = _r$3.$blk(); } if (_r$3 && _r$3.$blk !== undefined) { break s; }
					/* */ if (!_r$3) { $s = 20; continue; }
					/* */ $s = 21; continue;
					/* if (!_r$3) { */ case 20:
						$s = -1; return false;
					/* } */ case 21:
					i = i + (1) >> 0;
				/* } */ $s = 18; continue; case 19:
				i$1 = 0;
				/* while (true) { */ case 23:
					/* if (!(i$1 < t.rtype.NumOut())) { break; } */ if(!(i$1 < t.rtype.NumOut())) { $s = 24; continue; }
					_r$4 = haveIdenticalType(t.rtype.Out(i$1), v.rtype.Out(i$1), cmpTags); /* */ $s = 27; case 27: if($c) { $c = false; _r$4 = _r$4.$blk(); } if (_r$4 && _r$4.$blk !== undefined) { break s; }
					/* */ if (!_r$4) { $s = 25; continue; }
					/* */ $s = 26; continue;
					/* if (!_r$4) { */ case 25:
						$s = -1; return false;
					/* } */ case 26:
					i$1 = i$1 + (1) >> 0;
				/* } */ $s = 23; continue; case 24:
				$s = -1; return true;
			/* } else if (_1 === (20)) { */ case 5:
				t$1 = (T.kindType);
				v$1 = (V.kindType);
				if ((t$1.methods.$length === 0) && (v$1.methods.$length === 0)) {
					$s = -1; return true;
				}
				$s = -1; return false;
			/* } else if (_1 === (21)) { */ case 6:
				_r$5 = haveIdenticalType(T.Key(), V.Key(), cmpTags); /* */ $s = 29; case 29: if($c) { $c = false; _r$5 = _r$5.$blk(); } if (_r$5 && _r$5.$blk !== undefined) { break s; }
				if (!(_r$5)) { _v$3 = false; $s = 28; continue s; }
				_r$6 = haveIdenticalType(T.Elem(), V.Elem(), cmpTags); /* */ $s = 30; case 30: if($c) { $c = false; _r$6 = _r$6.$blk(); } if (_r$6 && _r$6.$blk !== undefined) { break s; }
				_v$3 = _r$6; case 28:
				$s = -1; return _v$3;
			/* } else if ((_1 === (22)) || (_1 === (23))) { */ case 7:
				_r$7 = haveIdenticalType(T.Elem(), V.Elem(), cmpTags); /* */ $s = 31; case 31: if($c) { $c = false; _r$7 = _r$7.$blk(); } if (_r$7 && _r$7.$blk !== undefined) { break s; }
				$s = -1; return _r$7;
			/* } else if (_1 === (25)) { */ case 8:
				t$2 = (T.kindType);
				v$2 = (V.kindType);
				if (!((t$2.fields.$length === v$2.fields.$length))) {
					$s = -1; return false;
				}
				_ref = t$2.fields;
				_i = 0;
				/* while (true) { */ case 32:
					/* if (!(_i < _ref.$length)) { break; } */ if(!(_i < _ref.$length)) { $s = 33; continue; }
					i$2 = _i;
					tf = (x = t$2.fields, ((i$2 < 0 || i$2 >= x.$length) ? ($throwRuntimeError("index out of range"), undefined) : x.$array[x.$offset + i$2]));
					vf = (x$1 = v$2.fields, ((i$2 < 0 || i$2 >= x$1.$length) ? ($throwRuntimeError("index out of range"), undefined) : x$1.$array[x$1.$offset + i$2]));
					if (!($clone(tf.name, name).name() === $clone(vf.name, name).name())) {
						$s = -1; return false;
					}
					_r$8 = haveIdenticalType(tf.typ, vf.typ, cmpTags); /* */ $s = 36; case 36: if($c) { $c = false; _r$8 = _r$8.$blk(); } if (_r$8 && _r$8.$blk !== undefined) { break s; }
					/* */ if (!_r$8) { $s = 34; continue; }
					/* */ $s = 35; continue;
					/* if (!_r$8) { */ case 34:
						$s = -1; return false;
					/* } */ case 35:
					if (cmpTags && !($clone(tf.name, name).tag() === $clone(vf.name, name).tag())) {
						$s = -1; return false;
					}
					if (!((tf.offset === vf.offset))) {
						$s = -1; return false;
					}
					if (!$clone(tf.name, name).isExported()) {
						tp = $clone(tf.name, name).pkgPath();
						if (tp === "") {
							tp = $clone(t$2.pkgPath, name).name();
						}
						vp = $clone(vf.name, name).pkgPath();
						if (vp === "") {
							vp = $clone(v$2.pkgPath, name).name();
						}
						if (!(tp === vp)) {
							$s = -1; return false;
						}
					}
					_i++;
				/* } */ $s = 32; continue; case 33:
				$s = -1; return true;
			/* } */ case 9:
		case 1:
		$s = -1; return false;
		/* */ } return; } if ($f === undefined) { $f = { $blk: haveIdenticalUnderlyingType }; } $f.$ptr = $ptr; $f.T = T; $f.V = V; $f._1 = _1; $f._i = _i; $f._r = _r; $f._r$1 = _r$1; $f._r$2 = _r$2; $f._r$3 = _r$3; $f._r$4 = _r$4; $f._r$5 = _r$5; $f._r$6 = _r$6; $f._r$7 = _r$7; $f._r$8 = _r$8; $f._ref = _ref; $f._v = _v; $f._v$1 = _v$1; $f._v$2 = _v$2; $f._v$3 = _v$3; $f.cmpTags = cmpTags; $f.i = i; $f.i$1 = i$1; $f.i$2 = i$2; $f.kind = kind; $f.t = t; $f.t$1 = t$1; $f.t$2 = t$2; $f.tf = tf; $f.tp = tp; $f.v = v; $f.v$1 = v$1; $f.v$2 = v$2; $f.vf = vf; $f.vp = vp; $f.x = x; $f.x$1 = x$1; $f.$s = $s; $f.$r = $r; return $f;
	};
	toType = function(t) {
		var $ptr, t;
		if (t === ptrType$1.nil) {
			return $ifaceNil;
		}
		return t;
	};
	ifaceIndir = function(t) {
		var $ptr, t;
		return ((t.kind & 32) >>> 0) === 0;
	};
	flag.prototype.kind = function() {
		var $ptr, f;
		f = this.$val;
		return ((((f & 31) >>> 0) >>> 0));
	};
	$ptrType(flag).prototype.kind = function() { return new flag(this.$get()).kind(); };
	Value.ptr.prototype.pointer = function() {
		var $ptr, v;
		v = this;
		if (!((v.typ.size === 4)) || !v.typ.pointers()) {
			$panic(new $String("can't call pointer on a non-pointer Value"));
		}
		if (!((((v.flag & 128) >>> 0) === 0))) {
			return (v.ptr).$get();
		}
		return v.ptr;
	};
	Value.prototype.pointer = function() { return this.$val.pointer(); };
	ValueError.ptr.prototype.Error = function() {
		var $ptr, e;
		e = this;
		if (e.Kind === 0) {
			return "reflect: call of " + e.Method + " on zero Value";
		}
		return "reflect: call of " + e.Method + " on " + new Kind(e.Kind).String() + " Value";
	};
	ValueError.prototype.Error = function() { return this.$val.Error(); };
	flag.prototype.mustBe = function(expected) {
		var $ptr, expected, f;
		f = this.$val;
		if (!((new flag(f).kind() === expected))) {
			$panic(new ValueError.ptr(methodName(), new flag(f).kind()));
		}
	};
	$ptrType(flag).prototype.mustBe = function(expected) { return new flag(this.$get()).mustBe(expected); };
	flag.prototype.mustBeExported = function() {
		var $ptr, f;
		f = this.$val;
		if (f === 0) {
			$panic(new ValueError.ptr(methodName(), 0));
		}
		if (!((((f & 96) >>> 0) === 0))) {
			$panic(new $String("reflect: " + methodName() + " using value obtained using unexported field"));
		}
	};
	$ptrType(flag).prototype.mustBeExported = function() { return new flag(this.$get()).mustBeExported(); };
	flag.prototype.mustBeAssignable = function() {
		var $ptr, f;
		f = this.$val;
		if (f === 0) {
			$panic(new ValueError.ptr(methodName(), 0));
		}
		if (!((((f & 96) >>> 0) === 0))) {
			$panic(new $String("reflect: " + methodName() + " using value obtained using unexported field"));
		}
		if (((f & 256) >>> 0) === 0) {
			$panic(new $String("reflect: " + methodName() + " using unaddressable value"));
		}
	};
	$ptrType(flag).prototype.mustBeAssignable = function() { return new flag(this.$get()).mustBeAssignable(); };
	Value.ptr.prototype.Addr = function() {
		var $ptr, v;
		v = this;
		if (((v.flag & 256) >>> 0) === 0) {
			$panic(new $String("reflect.Value.Addr of unaddressable value"));
		}
		return new Value.ptr(v.typ.ptrTo(), v.ptr, ((((v.flag & 96) >>> 0)) | 22) >>> 0);
	};
	Value.prototype.Addr = function() { return this.$val.Addr(); };
	Value.ptr.prototype.Bool = function() {
		var $ptr, v;
		v = this;
		new flag(v.flag).mustBe(1);
		return (v.ptr).$get();
	};
	Value.prototype.Bool = function() { return this.$val.Bool(); };
	Value.ptr.prototype.Bytes = function() {
		var $ptr, _r, v, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; $ptr = $f.$ptr; _r = $f._r; v = $f.v; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		v = this;
		new flag(v.flag).mustBe(23);
		_r = v.typ.Elem().Kind(); /* */ $s = 3; case 3: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
		/* */ if (!((_r === 8))) { $s = 1; continue; }
		/* */ $s = 2; continue;
		/* if (!((_r === 8))) { */ case 1:
			$panic(new $String("reflect.Value.Bytes of non-byte slice"));
		/* } */ case 2:
		$s = -1; return (v.ptr).$get();
		/* */ } return; } if ($f === undefined) { $f = { $blk: Value.ptr.prototype.Bytes }; } $f.$ptr = $ptr; $f._r = _r; $f.v = v; $f.$s = $s; $f.$r = $r; return $f;
	};
	Value.prototype.Bytes = function() { return this.$val.Bytes(); };
	Value.ptr.prototype.runes = function() {
		var $ptr, _r, v, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; $ptr = $f.$ptr; _r = $f._r; v = $f.v; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		v = this;
		new flag(v.flag).mustBe(23);
		_r = v.typ.Elem().Kind(); /* */ $s = 3; case 3: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
		/* */ if (!((_r === 5))) { $s = 1; continue; }
		/* */ $s = 2; continue;
		/* if (!((_r === 5))) { */ case 1:
			$panic(new $String("reflect.Value.Bytes of non-rune slice"));
		/* } */ case 2:
		$s = -1; return (v.ptr).$get();
		/* */ } return; } if ($f === undefined) { $f = { $blk: Value.ptr.prototype.runes }; } $f.$ptr = $ptr; $f._r = _r; $f.v = v; $f.$s = $s; $f.$r = $r; return $f;
	};
	Value.prototype.runes = function() { return this.$val.runes(); };
	Value.ptr.prototype.CanAddr = function() {
		var $ptr, v;
		v = this;
		return !((((v.flag & 256) >>> 0) === 0));
	};
	Value.prototype.CanAddr = function() { return this.$val.CanAddr(); };
	Value.ptr.prototype.CanSet = function() {
		var $ptr, v;
		v = this;
		return ((v.flag & 352) >>> 0) === 256;
	};
	Value.prototype.CanSet = function() { return this.$val.CanSet(); };
	Value.ptr.prototype.Call = function(in$1) {
		var $ptr, _r, in$1, v, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; $ptr = $f.$ptr; _r = $f._r; in$1 = $f.in$1; v = $f.v; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		v = this;
		new flag(v.flag).mustBe(19);
		new flag(v.flag).mustBeExported();
		_r = $clone(v, Value).call("Call", in$1); /* */ $s = 1; case 1: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
		$s = -1; return _r;
		/* */ } return; } if ($f === undefined) { $f = { $blk: Value.ptr.prototype.Call }; } $f.$ptr = $ptr; $f._r = _r; $f.in$1 = in$1; $f.v = v; $f.$s = $s; $f.$r = $r; return $f;
	};
	Value.prototype.Call = function(in$1) { return this.$val.Call(in$1); };
	Value.ptr.prototype.CallSlice = function(in$1) {
		var $ptr, _r, in$1, v, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; $ptr = $f.$ptr; _r = $f._r; in$1 = $f.in$1; v = $f.v; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		v = this;
		new flag(v.flag).mustBe(19);
		new flag(v.flag).mustBeExported();
		_r = $clone(v, Value).call("CallSlice", in$1); /* */ $s = 1; case 1: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
		$s = -1; return _r;
		/* */ } return; } if ($f === undefined) { $f = { $blk: Value.ptr.prototype.CallSlice }; } $f.$ptr = $ptr; $f._r = _r; $f.in$1 = in$1; $f.v = v; $f.$s = $s; $f.$r = $r; return $f;
	};
	Value.prototype.CallSlice = function(in$1) { return this.$val.CallSlice(in$1); };
	Value.ptr.prototype.Complex = function() {
		var $ptr, _1, k, v, x;
		v = this;
		k = new flag(v.flag).kind();
		_1 = k;
		if (_1 === (15)) {
			return ((x = (v.ptr).$get(), new $Complex128(x.$real, x.$imag)));
		} else if (_1 === (16)) {
			return (v.ptr).$get();
		}
		$panic(new ValueError.ptr("reflect.Value.Complex", new flag(v.flag).kind()));
	};
	Value.prototype.Complex = function() { return this.$val.Complex(); };
	Value.ptr.prototype.FieldByIndex = function(index) {
		var $ptr, _i, _r, _r$1, _r$2, _r$3, _ref, _v, i, index, v, x, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; $ptr = $f.$ptr; _i = $f._i; _r = $f._r; _r$1 = $f._r$1; _r$2 = $f._r$2; _r$3 = $f._r$3; _ref = $f._ref; _v = $f._v; i = $f.i; index = $f.index; v = $f.v; x = $f.x; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		v = this;
		/* */ if (index.$length === 1) { $s = 1; continue; }
		/* */ $s = 2; continue;
		/* if (index.$length === 1) { */ case 1:
			_r = $clone(v, Value).Field((0 >= index.$length ? ($throwRuntimeError("index out of range"), undefined) : index.$array[index.$offset + 0])); /* */ $s = 3; case 3: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
			$s = -1; return _r;
		/* } */ case 2:
		new flag(v.flag).mustBe(25);
		_ref = index;
		_i = 0;
		/* while (true) { */ case 4:
			/* if (!(_i < _ref.$length)) { break; } */ if(!(_i < _ref.$length)) { $s = 5; continue; }
			i = _i;
			x = ((_i < 0 || _i >= _ref.$length) ? ($throwRuntimeError("index out of range"), undefined) : _ref.$array[_ref.$offset + _i]);
			/* */ if (i > 0) { $s = 6; continue; }
			/* */ $s = 7; continue;
			/* if (i > 0) { */ case 6:
				if (!($clone(v, Value).Kind() === 22)) { _v = false; $s = 10; continue s; }
				_r$1 = v.typ.Elem().Kind(); /* */ $s = 11; case 11: if($c) { $c = false; _r$1 = _r$1.$blk(); } if (_r$1 && _r$1.$blk !== undefined) { break s; }
				_v = _r$1 === 25; case 10:
				/* */ if (_v) { $s = 8; continue; }
				/* */ $s = 9; continue;
				/* if (_v) { */ case 8:
					if ($clone(v, Value).IsNil()) {
						$panic(new $String("reflect: indirection through nil pointer to embedded struct"));
					}
					_r$2 = $clone(v, Value).Elem(); /* */ $s = 12; case 12: if($c) { $c = false; _r$2 = _r$2.$blk(); } if (_r$2 && _r$2.$blk !== undefined) { break s; }
					v = _r$2;
				/* } */ case 9:
			/* } */ case 7:
			_r$3 = $clone(v, Value).Field(x); /* */ $s = 13; case 13: if($c) { $c = false; _r$3 = _r$3.$blk(); } if (_r$3 && _r$3.$blk !== undefined) { break s; }
			v = _r$3;
			_i++;
		/* } */ $s = 4; continue; case 5:
		$s = -1; return v;
		/* */ } return; } if ($f === undefined) { $f = { $blk: Value.ptr.prototype.FieldByIndex }; } $f.$ptr = $ptr; $f._i = _i; $f._r = _r; $f._r$1 = _r$1; $f._r$2 = _r$2; $f._r$3 = _r$3; $f._ref = _ref; $f._v = _v; $f.i = i; $f.index = index; $f.v = v; $f.x = x; $f.$s = $s; $f.$r = $r; return $f;
	};
	Value.prototype.FieldByIndex = function(index) { return this.$val.FieldByIndex(index); };
	Value.ptr.prototype.FieldByName = function(name$1) {
		var $ptr, _r, _r$1, _tuple, f, name$1, ok, v, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; $ptr = $f.$ptr; _r = $f._r; _r$1 = $f._r$1; _tuple = $f._tuple; f = $f.f; name$1 = $f.name$1; ok = $f.ok; v = $f.v; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		v = this;
		new flag(v.flag).mustBe(25);
		_r = v.typ.FieldByName(name$1); /* */ $s = 1; case 1: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
		_tuple = _r;
		f = $clone(_tuple[0], StructField);
		ok = _tuple[1];
		/* */ if (ok) { $s = 2; continue; }
		/* */ $s = 3; continue;
		/* if (ok) { */ case 2:
			_r$1 = $clone(v, Value).FieldByIndex(f.Index); /* */ $s = 4; case 4: if($c) { $c = false; _r$1 = _r$1.$blk(); } if (_r$1 && _r$1.$blk !== undefined) { break s; }
			$s = -1; return _r$1;
		/* } */ case 3:
		$s = -1; return new Value.ptr(ptrType$1.nil, 0, 0);
		/* */ } return; } if ($f === undefined) { $f = { $blk: Value.ptr.prototype.FieldByName }; } $f.$ptr = $ptr; $f._r = _r; $f._r$1 = _r$1; $f._tuple = _tuple; $f.f = f; $f.name$1 = name$1; $f.ok = ok; $f.v = v; $f.$s = $s; $f.$r = $r; return $f;
	};
	Value.prototype.FieldByName = function(name$1) { return this.$val.FieldByName(name$1); };
	Value.ptr.prototype.FieldByNameFunc = function(match) {
		var $ptr, _r, _r$1, _tuple, f, match, ok, v, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; $ptr = $f.$ptr; _r = $f._r; _r$1 = $f._r$1; _tuple = $f._tuple; f = $f.f; match = $f.match; ok = $f.ok; v = $f.v; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		v = this;
		_r = v.typ.FieldByNameFunc(match); /* */ $s = 1; case 1: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
		_tuple = _r;
		f = $clone(_tuple[0], StructField);
		ok = _tuple[1];
		/* */ if (ok) { $s = 2; continue; }
		/* */ $s = 3; continue;
		/* if (ok) { */ case 2:
			_r$1 = $clone(v, Value).FieldByIndex(f.Index); /* */ $s = 4; case 4: if($c) { $c = false; _r$1 = _r$1.$blk(); } if (_r$1 && _r$1.$blk !== undefined) { break s; }
			$s = -1; return _r$1;
		/* } */ case 3:
		$s = -1; return new Value.ptr(ptrType$1.nil, 0, 0);
		/* */ } return; } if ($f === undefined) { $f = { $blk: Value.ptr.prototype.FieldByNameFunc }; } $f.$ptr = $ptr; $f._r = _r; $f._r$1 = _r$1; $f._tuple = _tuple; $f.f = f; $f.match = match; $f.ok = ok; $f.v = v; $f.$s = $s; $f.$r = $r; return $f;
	};
	Value.prototype.FieldByNameFunc = function(match) { return this.$val.FieldByNameFunc(match); };
	Value.ptr.prototype.Float = function() {
		var $ptr, _1, k, v;
		v = this;
		k = new flag(v.flag).kind();
		_1 = k;
		if (_1 === (13)) {
			return ((v.ptr).$get());
		} else if (_1 === (14)) {
			return (v.ptr).$get();
		}
		$panic(new ValueError.ptr("reflect.Value.Float", new flag(v.flag).kind()));
	};
	Value.prototype.Float = function() { return this.$val.Float(); };
	Value.ptr.prototype.Int = function() {
		var $ptr, _1, k, p, v;
		v = this;
		k = new flag(v.flag).kind();
		p = v.ptr;
		_1 = k;
		if (_1 === (2)) {
			return (new $Int64(0, (p).$get()));
		} else if (_1 === (3)) {
			return (new $Int64(0, (p).$get()));
		} else if (_1 === (4)) {
			return (new $Int64(0, (p).$get()));
		} else if (_1 === (5)) {
			return (new $Int64(0, (p).$get()));
		} else if (_1 === (6)) {
			return (p).$get();
		}
		$panic(new ValueError.ptr("reflect.Value.Int", new flag(v.flag).kind()));
	};
	Value.prototype.Int = function() { return this.$val.Int(); };
	Value.ptr.prototype.CanInterface = function() {
		var $ptr, v;
		v = this;
		if (v.flag === 0) {
			$panic(new ValueError.ptr("reflect.Value.CanInterface", 0));
		}
		return ((v.flag & 96) >>> 0) === 0;
	};
	Value.prototype.CanInterface = function() { return this.$val.CanInterface(); };
	Value.ptr.prototype.Interface = function() {
		var $ptr, _r, i, v, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; $ptr = $f.$ptr; _r = $f._r; i = $f.i; v = $f.v; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		i = $ifaceNil;
		v = this;
		_r = valueInterface($clone(v, Value), true); /* */ $s = 1; case 1: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
		i = _r;
		$s = -1; return i;
		/* */ } return; } if ($f === undefined) { $f = { $blk: Value.ptr.prototype.Interface }; } $f.$ptr = $ptr; $f._r = _r; $f.i = i; $f.v = v; $f.$s = $s; $f.$r = $r; return $f;
	};
	Value.prototype.Interface = function() { return this.$val.Interface(); };
	Value.ptr.prototype.IsValid = function() {
		var $ptr, v;
		v = this;
		return !((v.flag === 0));
	};
	Value.prototype.IsValid = function() { return this.$val.IsValid(); };
	Value.ptr.prototype.Kind = function() {
		var $ptr, v;
		v = this;
		return new flag(v.flag).kind();
	};
	Value.prototype.Kind = function() { return this.$val.Kind(); };
	Value.ptr.prototype.MapIndex = function(key) {
		var $ptr, _r, c, e, fl, k, key, tt, typ, v, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; $ptr = $f.$ptr; _r = $f._r; c = $f.c; e = $f.e; fl = $f.fl; k = $f.k; key = $f.key; tt = $f.tt; typ = $f.typ; v = $f.v; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		v = this;
		new flag(v.flag).mustBe(21);
		tt = (v.typ.kindType);
		_r = $clone(key, Value).assignTo("reflect.Value.MapIndex", tt.key, 0); /* */ $s = 1; case 1: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
		key = _r;
		k = 0;
		if (!((((key.flag & 128) >>> 0) === 0))) {
			k = key.ptr;
		} else {
			k = ((key.$ptr_ptr || (key.$ptr_ptr = new ptrType$16(function() { return this.$target.ptr; }, function($v) { this.$target.ptr = $v; }, key))));
		}
		e = mapaccess(v.typ, $clone(v, Value).pointer(), k);
		if (e === 0) {
			$s = -1; return new Value.ptr(ptrType$1.nil, 0, 0);
		}
		typ = tt.elem;
		fl = ((((v.flag | key.flag) >>> 0)) & 96) >>> 0;
		fl = (fl | (((typ.Kind() >>> 0)))) >>> 0;
		if (ifaceIndir(typ)) {
			c = unsafe_New(typ);
			typedmemmove(typ, c, e);
			$s = -1; return new Value.ptr(typ, c, (fl | 128) >>> 0);
		} else {
			$s = -1; return new Value.ptr(typ, (e).$get(), fl);
		}
		$s = -1; return new Value.ptr(ptrType$1.nil, 0, 0);
		/* */ } return; } if ($f === undefined) { $f = { $blk: Value.ptr.prototype.MapIndex }; } $f.$ptr = $ptr; $f._r = _r; $f.c = c; $f.e = e; $f.fl = fl; $f.k = k; $f.key = key; $f.tt = tt; $f.typ = typ; $f.v = v; $f.$s = $s; $f.$r = $r; return $f;
	};
	Value.prototype.MapIndex = function(key) { return this.$val.MapIndex(key); };
	Value.ptr.prototype.MapKeys = function() {
		var $ptr, _r, a, c, fl, i, it, key, keyType, m, mlen, tt, v, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; $ptr = $f.$ptr; _r = $f._r; a = $f.a; c = $f.c; fl = $f.fl; i = $f.i; it = $f.it; key = $f.key; keyType = $f.keyType; m = $f.m; mlen = $f.mlen; tt = $f.tt; v = $f.v; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		v = this;
		new flag(v.flag).mustBe(21);
		tt = (v.typ.kindType);
		keyType = tt.key;
		fl = (((v.flag & 96) >>> 0) | ((keyType.Kind() >>> 0))) >>> 0;
		m = $clone(v, Value).pointer();
		mlen = 0;
		if (!(m === 0)) {
			mlen = maplen(m);
		}
		it = mapiterinit(v.typ, m);
		a = $makeSlice(sliceType$10, mlen);
		i = 0;
		i = 0;
		/* while (true) { */ case 1:
			/* if (!(i < a.$length)) { break; } */ if(!(i < a.$length)) { $s = 2; continue; }
			_r = mapiterkey(it); /* */ $s = 3; case 3: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
			key = _r;
			if (key === 0) {
				/* break; */ $s = 2; continue;
			}
			if (ifaceIndir(keyType)) {
				c = unsafe_New(keyType);
				typedmemmove(keyType, c, key);
				((i < 0 || i >= a.$length) ? ($throwRuntimeError("index out of range"), undefined) : a.$array[a.$offset + i] = new Value.ptr(keyType, c, (fl | 128) >>> 0));
			} else {
				((i < 0 || i >= a.$length) ? ($throwRuntimeError("index out of range"), undefined) : a.$array[a.$offset + i] = new Value.ptr(keyType, (key).$get(), fl));
			}
			mapiternext(it);
			i = i + (1) >> 0;
		/* } */ $s = 1; continue; case 2:
		$s = -1; return $subslice(a, 0, i);
		/* */ } return; } if ($f === undefined) { $f = { $blk: Value.ptr.prototype.MapKeys }; } $f.$ptr = $ptr; $f._r = _r; $f.a = a; $f.c = c; $f.fl = fl; $f.i = i; $f.it = it; $f.key = key; $f.keyType = keyType; $f.m = m; $f.mlen = mlen; $f.tt = tt; $f.v = v; $f.$s = $s; $f.$r = $r; return $f;
	};
	Value.prototype.MapKeys = function() { return this.$val.MapKeys(); };
	Value.ptr.prototype.Method = function(i) {
		var $ptr, _r, _v, fl, i, v, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; $ptr = $f.$ptr; _r = $f._r; _v = $f._v; fl = $f.fl; i = $f.i; v = $f.v; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		v = this;
		if (v.typ === ptrType$1.nil) {
			$panic(new ValueError.ptr("reflect.Value.Method", 0));
		}
		if (!((((v.flag & 512) >>> 0) === 0))) { _v = true; $s = 3; continue s; }
		_r = v.typ.NumMethod(); /* */ $s = 4; case 4: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
		_v = ((i >>> 0)) >= ((_r >>> 0)); case 3:
		/* */ if (_v) { $s = 1; continue; }
		/* */ $s = 2; continue;
		/* if (_v) { */ case 1:
			$panic(new $String("reflect: Method index out of range"));
		/* } */ case 2:
		if ((v.typ.Kind() === 20) && $clone(v, Value).IsNil()) {
			$panic(new $String("reflect: Method on nil interface value"));
		}
		fl = (v.flag & 160) >>> 0;
		fl = (fl | (19)) >>> 0;
		fl = (fl | ((((((i >>> 0)) << 10 >>> 0) | 512) >>> 0))) >>> 0;
		$s = -1; return new Value.ptr(v.typ, v.ptr, fl);
		/* */ } return; } if ($f === undefined) { $f = { $blk: Value.ptr.prototype.Method }; } $f.$ptr = $ptr; $f._r = _r; $f._v = _v; $f.fl = fl; $f.i = i; $f.v = v; $f.$s = $s; $f.$r = $r; return $f;
	};
	Value.prototype.Method = function(i) { return this.$val.Method(i); };
	Value.ptr.prototype.NumMethod = function() {
		var $ptr, _r, v, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; $ptr = $f.$ptr; _r = $f._r; v = $f.v; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		v = this;
		if (v.typ === ptrType$1.nil) {
			$panic(new ValueError.ptr("reflect.Value.NumMethod", 0));
		}
		if (!((((v.flag & 512) >>> 0) === 0))) {
			$s = -1; return 0;
		}
		_r = v.typ.NumMethod(); /* */ $s = 1; case 1: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
		$s = -1; return _r;
		/* */ } return; } if ($f === undefined) { $f = { $blk: Value.ptr.prototype.NumMethod }; } $f.$ptr = $ptr; $f._r = _r; $f.v = v; $f.$s = $s; $f.$r = $r; return $f;
	};
	Value.prototype.NumMethod = function() { return this.$val.NumMethod(); };
	Value.ptr.prototype.MethodByName = function(name$1) {
		var $ptr, _r, _r$1, _tuple, m, name$1, ok, v, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; $ptr = $f.$ptr; _r = $f._r; _r$1 = $f._r$1; _tuple = $f._tuple; m = $f.m; name$1 = $f.name$1; ok = $f.ok; v = $f.v; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		v = this;
		if (v.typ === ptrType$1.nil) {
			$panic(new ValueError.ptr("reflect.Value.MethodByName", 0));
		}
		if (!((((v.flag & 512) >>> 0) === 0))) {
			$s = -1; return new Value.ptr(ptrType$1.nil, 0, 0);
		}
		_r = v.typ.MethodByName(name$1); /* */ $s = 1; case 1: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
		_tuple = _r;
		m = $clone(_tuple[0], Method);
		ok = _tuple[1];
		if (!ok) {
			$s = -1; return new Value.ptr(ptrType$1.nil, 0, 0);
		}
		_r$1 = $clone(v, Value).Method(m.Index); /* */ $s = 2; case 2: if($c) { $c = false; _r$1 = _r$1.$blk(); } if (_r$1 && _r$1.$blk !== undefined) { break s; }
		$s = -1; return _r$1;
		/* */ } return; } if ($f === undefined) { $f = { $blk: Value.ptr.prototype.MethodByName }; } $f.$ptr = $ptr; $f._r = _r; $f._r$1 = _r$1; $f._tuple = _tuple; $f.m = m; $f.name$1 = name$1; $f.ok = ok; $f.v = v; $f.$s = $s; $f.$r = $r; return $f;
	};
	Value.prototype.MethodByName = function(name$1) { return this.$val.MethodByName(name$1); };
	Value.ptr.prototype.NumField = function() {
		var $ptr, tt, v;
		v = this;
		new flag(v.flag).mustBe(25);
		tt = (v.typ.kindType);
		return tt.fields.$length;
	};
	Value.prototype.NumField = function() { return this.$val.NumField(); };
	Value.ptr.prototype.OverflowComplex = function(x) {
		var $ptr, _1, k, v, x;
		v = this;
		k = new flag(v.flag).kind();
		_1 = k;
		if (_1 === (15)) {
			return overflowFloat32(x.$real) || overflowFloat32(x.$imag);
		} else if (_1 === (16)) {
			return false;
		}
		$panic(new ValueError.ptr("reflect.Value.OverflowComplex", new flag(v.flag).kind()));
	};
	Value.prototype.OverflowComplex = function(x) { return this.$val.OverflowComplex(x); };
	Value.ptr.prototype.OverflowFloat = function(x) {
		var $ptr, _1, k, v, x;
		v = this;
		k = new flag(v.flag).kind();
		_1 = k;
		if (_1 === (13)) {
			return overflowFloat32(x);
		} else if (_1 === (14)) {
			return false;
		}
		$panic(new ValueError.ptr("reflect.Value.OverflowFloat", new flag(v.flag).kind()));
	};
	Value.prototype.OverflowFloat = function(x) { return this.$val.OverflowFloat(x); };
	overflowFloat32 = function(x) {
		var $ptr, x;
		if (x < 0) {
			x = -x;
		}
		return 3.4028234663852886e+38 < x && x <= 1.7976931348623157e+308;
	};
	Value.ptr.prototype.OverflowInt = function(x) {
		var $ptr, _1, bitSize, k, trunc, v, x;
		v = this;
		k = new flag(v.flag).kind();
		_1 = k;
		if ((_1 === (2)) || (_1 === (3)) || (_1 === (4)) || (_1 === (5)) || (_1 === (6))) {
			bitSize = $imul(v.typ.size, 8) >>> 0;
			trunc = $shiftRightInt64(($shiftLeft64(x, ((64 - bitSize >>> 0)))), ((64 - bitSize >>> 0)));
			return !((x.$high === trunc.$high && x.$low === trunc.$low));
		}
		$panic(new ValueError.ptr("reflect.Value.OverflowInt", new flag(v.flag).kind()));
	};
	Value.prototype.OverflowInt = function(x) { return this.$val.OverflowInt(x); };
	Value.ptr.prototype.OverflowUint = function(x) {
		var $ptr, _1, bitSize, k, trunc, v, x;
		v = this;
		k = new flag(v.flag).kind();
		_1 = k;
		if ((_1 === (7)) || (_1 === (12)) || (_1 === (8)) || (_1 === (9)) || (_1 === (10)) || (_1 === (11))) {
			bitSize = $imul(v.typ.size, 8) >>> 0;
			trunc = $shiftRightUint64(($shiftLeft64(x, ((64 - bitSize >>> 0)))), ((64 - bitSize >>> 0)));
			return !((x.$high === trunc.$high && x.$low === trunc.$low));
		}
		$panic(new ValueError.ptr("reflect.Value.OverflowUint", new flag(v.flag).kind()));
	};
	Value.prototype.OverflowUint = function(x) { return this.$val.OverflowUint(x); };
	Value.ptr.prototype.Recv = function() {
		var $ptr, _r, _tuple, ok, v, x, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; $ptr = $f.$ptr; _r = $f._r; _tuple = $f._tuple; ok = $f.ok; v = $f.v; x = $f.x; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		x = new Value.ptr(ptrType$1.nil, 0, 0);
		ok = false;
		v = this;
		new flag(v.flag).mustBe(18);
		new flag(v.flag).mustBeExported();
		_r = $clone(v, Value).recv(false); /* */ $s = 1; case 1: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
		_tuple = _r;
		x = _tuple[0];
		ok = _tuple[1];
		$s = -1; return [x, ok];
		/* */ } return; } if ($f === undefined) { $f = { $blk: Value.ptr.prototype.Recv }; } $f.$ptr = $ptr; $f._r = _r; $f._tuple = _tuple; $f.ok = ok; $f.v = v; $f.x = x; $f.$s = $s; $f.$r = $r; return $f;
	};
	Value.prototype.Recv = function() { return this.$val.Recv(); };
	Value.ptr.prototype.recv = function(nb) {
		var $ptr, _r, _tuple, nb, ok, p, selected, t, tt, v, val, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; $ptr = $f.$ptr; _r = $f._r; _tuple = $f._tuple; nb = $f.nb; ok = $f.ok; p = $f.p; selected = $f.selected; t = $f.t; tt = $f.tt; v = $f.v; val = $f.val; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		val = new Value.ptr(ptrType$1.nil, 0, 0);
		ok = false;
		v = this;
		tt = (v.typ.kindType);
		if ((((tt.dir >> 0)) & 1) === 0) {
			$panic(new $String("reflect: recv on send-only channel"));
		}
		t = tt.elem;
		val = new Value.ptr(t, 0, ((t.Kind() >>> 0)));
		p = 0;
		if (ifaceIndir(t)) {
			p = unsafe_New(t);
			val.ptr = p;
			val.flag = (val.flag | (128)) >>> 0;
		} else {
			p = ((val.$ptr_ptr || (val.$ptr_ptr = new ptrType$16(function() { return this.$target.ptr; }, function($v) { this.$target.ptr = $v; }, val))));
		}
		_r = chanrecv(v.typ, $clone(v, Value).pointer(), nb, p); /* */ $s = 1; case 1: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
		_tuple = _r;
		selected = _tuple[0];
		ok = _tuple[1];
		if (!selected) {
			val = new Value.ptr(ptrType$1.nil, 0, 0);
		}
		$s = -1; return [val, ok];
		/* */ } return; } if ($f === undefined) { $f = { $blk: Value.ptr.prototype.recv }; } $f.$ptr = $ptr; $f._r = _r; $f._tuple = _tuple; $f.nb = nb; $f.ok = ok; $f.p = p; $f.selected = selected; $f.t = t; $f.tt = tt; $f.v = v; $f.val = val; $f.$s = $s; $f.$r = $r; return $f;
	};
	Value.prototype.recv = function(nb) { return this.$val.recv(nb); };
	Value.ptr.prototype.Send = function(x) {
		var $ptr, _r, v, x, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; $ptr = $f.$ptr; _r = $f._r; v = $f.v; x = $f.x; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		v = this;
		new flag(v.flag).mustBe(18);
		new flag(v.flag).mustBeExported();
		_r = $clone(v, Value).send($clone(x, Value), false); /* */ $s = 1; case 1: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
		_r;
		$s = -1; return;
		/* */ } return; } if ($f === undefined) { $f = { $blk: Value.ptr.prototype.Send }; } $f.$ptr = $ptr; $f._r = _r; $f.v = v; $f.x = x; $f.$s = $s; $f.$r = $r; return $f;
	};
	Value.prototype.Send = function(x) { return this.$val.Send(x); };
	Value.ptr.prototype.send = function(x, nb) {
		var $ptr, _r, _r$1, nb, p, selected, tt, v, x, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; $ptr = $f.$ptr; _r = $f._r; _r$1 = $f._r$1; nb = $f.nb; p = $f.p; selected = $f.selected; tt = $f.tt; v = $f.v; x = $f.x; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		selected = false;
		v = this;
		tt = (v.typ.kindType);
		if ((((tt.dir >> 0)) & 2) === 0) {
			$panic(new $String("reflect: send on recv-only channel"));
		}
		new flag(x.flag).mustBeExported();
		_r = $clone(x, Value).assignTo("reflect.Value.Send", tt.elem, 0); /* */ $s = 1; case 1: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
		x = _r;
		p = 0;
		if (!((((x.flag & 128) >>> 0) === 0))) {
			p = x.ptr;
		} else {
			p = ((x.$ptr_ptr || (x.$ptr_ptr = new ptrType$16(function() { return this.$target.ptr; }, function($v) { this.$target.ptr = $v; }, x))));
		}
		_r$1 = chansend(v.typ, $clone(v, Value).pointer(), p, nb); /* */ $s = 2; case 2: if($c) { $c = false; _r$1 = _r$1.$blk(); } if (_r$1 && _r$1.$blk !== undefined) { break s; }
		selected = _r$1;
		$s = -1; return selected;
		/* */ } return; } if ($f === undefined) { $f = { $blk: Value.ptr.prototype.send }; } $f.$ptr = $ptr; $f._r = _r; $f._r$1 = _r$1; $f.nb = nb; $f.p = p; $f.selected = selected; $f.tt = tt; $f.v = v; $f.x = x; $f.$s = $s; $f.$r = $r; return $f;
	};
	Value.prototype.send = function(x, nb) { return this.$val.send(x, nb); };
	Value.ptr.prototype.SetBool = function(x) {
		var $ptr, v, x;
		v = this;
		new flag(v.flag).mustBeAssignable();
		new flag(v.flag).mustBe(1);
		(v.ptr).$set(x);
	};
	Value.prototype.SetBool = function(x) { return this.$val.SetBool(x); };
	Value.ptr.prototype.setRunes = function(x) {
		var $ptr, _r, v, x, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; $ptr = $f.$ptr; _r = $f._r; v = $f.v; x = $f.x; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		v = this;
		new flag(v.flag).mustBeAssignable();
		new flag(v.flag).mustBe(23);
		_r = v.typ.Elem().Kind(); /* */ $s = 3; case 3: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
		/* */ if (!((_r === 5))) { $s = 1; continue; }
		/* */ $s = 2; continue;
		/* if (!((_r === 5))) { */ case 1:
			$panic(new $String("reflect.Value.setRunes of non-rune slice"));
		/* } */ case 2:
		(v.ptr).$set(x);
		$s = -1; return;
		/* */ } return; } if ($f === undefined) { $f = { $blk: Value.ptr.prototype.setRunes }; } $f.$ptr = $ptr; $f._r = _r; $f.v = v; $f.x = x; $f.$s = $s; $f.$r = $r; return $f;
	};
	Value.prototype.setRunes = function(x) { return this.$val.setRunes(x); };
	Value.ptr.prototype.SetComplex = function(x) {
		var $ptr, _1, k, v, x;
		v = this;
		new flag(v.flag).mustBeAssignable();
		k = new flag(v.flag).kind();
		_1 = k;
		if (_1 === (15)) {
			(v.ptr).$set((new $Complex64(x.$real, x.$imag)));
		} else if (_1 === (16)) {
			(v.ptr).$set(x);
		} else {
			$panic(new ValueError.ptr("reflect.Value.SetComplex", new flag(v.flag).kind()));
		}
	};
	Value.prototype.SetComplex = function(x) { return this.$val.SetComplex(x); };
	Value.ptr.prototype.SetFloat = function(x) {
		var $ptr, _1, k, v, x;
		v = this;
		new flag(v.flag).mustBeAssignable();
		k = new flag(v.flag).kind();
		_1 = k;
		if (_1 === (13)) {
			(v.ptr).$set(($fround(x)));
		} else if (_1 === (14)) {
			(v.ptr).$set(x);
		} else {
			$panic(new ValueError.ptr("reflect.Value.SetFloat", new flag(v.flag).kind()));
		}
	};
	Value.prototype.SetFloat = function(x) { return this.$val.SetFloat(x); };
	Value.ptr.prototype.SetInt = function(x) {
		var $ptr, _1, k, v, x;
		v = this;
		new flag(v.flag).mustBeAssignable();
		k = new flag(v.flag).kind();
		_1 = k;
		if (_1 === (2)) {
			(v.ptr).$set((((x.$low + ((x.$high >> 31) * 4294967296)) >> 0)));
		} else if (_1 === (3)) {
			(v.ptr).$set((((x.$low + ((x.$high >> 31) * 4294967296)) << 24 >> 24)));
		} else if (_1 === (4)) {
			(v.ptr).$set((((x.$low + ((x.$high >> 31) * 4294967296)) << 16 >> 16)));
		} else if (_1 === (5)) {
			(v.ptr).$set((((x.$low + ((x.$high >> 31) * 4294967296)) >> 0)));
		} else if (_1 === (6)) {
			(v.ptr).$set(x);
		} else {
			$panic(new ValueError.ptr("reflect.Value.SetInt", new flag(v.flag).kind()));
		}
	};
	Value.prototype.SetInt = function(x) { return this.$val.SetInt(x); };
	Value.ptr.prototype.SetMapIndex = function(key, val) {
		var $ptr, _r, _r$1, e, k, key, tt, v, val, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; $ptr = $f.$ptr; _r = $f._r; _r$1 = $f._r$1; e = $f.e; k = $f.k; key = $f.key; tt = $f.tt; v = $f.v; val = $f.val; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		v = this;
		new flag(v.flag).mustBe(21);
		new flag(v.flag).mustBeExported();
		new flag(key.flag).mustBeExported();
		tt = (v.typ.kindType);
		_r = $clone(key, Value).assignTo("reflect.Value.SetMapIndex", tt.key, 0); /* */ $s = 1; case 1: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
		key = _r;
		k = 0;
		if (!((((key.flag & 128) >>> 0) === 0))) {
			k = key.ptr;
		} else {
			k = ((key.$ptr_ptr || (key.$ptr_ptr = new ptrType$16(function() { return this.$target.ptr; }, function($v) { this.$target.ptr = $v; }, key))));
		}
		if (val.typ === ptrType$1.nil) {
			mapdelete(v.typ, $clone(v, Value).pointer(), k);
			$s = -1; return;
		}
		new flag(val.flag).mustBeExported();
		_r$1 = $clone(val, Value).assignTo("reflect.Value.SetMapIndex", tt.elem, 0); /* */ $s = 2; case 2: if($c) { $c = false; _r$1 = _r$1.$blk(); } if (_r$1 && _r$1.$blk !== undefined) { break s; }
		val = _r$1;
		e = 0;
		if (!((((val.flag & 128) >>> 0) === 0))) {
			e = val.ptr;
		} else {
			e = ((val.$ptr_ptr || (val.$ptr_ptr = new ptrType$16(function() { return this.$target.ptr; }, function($v) { this.$target.ptr = $v; }, val))));
		}
		$r = mapassign(v.typ, $clone(v, Value).pointer(), k, e); /* */ $s = 3; case 3: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
		$s = -1; return;
		/* */ } return; } if ($f === undefined) { $f = { $blk: Value.ptr.prototype.SetMapIndex }; } $f.$ptr = $ptr; $f._r = _r; $f._r$1 = _r$1; $f.e = e; $f.k = k; $f.key = key; $f.tt = tt; $f.v = v; $f.val = val; $f.$s = $s; $f.$r = $r; return $f;
	};
	Value.prototype.SetMapIndex = function(key, val) { return this.$val.SetMapIndex(key, val); };
	Value.ptr.prototype.SetUint = function(x) {
		var $ptr, _1, k, v, x;
		v = this;
		new flag(v.flag).mustBeAssignable();
		k = new flag(v.flag).kind();
		_1 = k;
		if (_1 === (7)) {
			(v.ptr).$set(((x.$low >>> 0)));
		} else if (_1 === (8)) {
			(v.ptr).$set(((x.$low << 24 >>> 24)));
		} else if (_1 === (9)) {
			(v.ptr).$set(((x.$low << 16 >>> 16)));
		} else if (_1 === (10)) {
			(v.ptr).$set(((x.$low >>> 0)));
		} else if (_1 === (11)) {
			(v.ptr).$set(x);
		} else if (_1 === (12)) {
			(v.ptr).$set(((x.$low >>> 0)));
		} else {
			$panic(new ValueError.ptr("reflect.Value.SetUint", new flag(v.flag).kind()));
		}
	};
	Value.prototype.SetUint = function(x) { return this.$val.SetUint(x); };
	Value.ptr.prototype.SetPointer = function(x) {
		var $ptr, v, x;
		v = this;
		new flag(v.flag).mustBeAssignable();
		new flag(v.flag).mustBe(26);
		(v.ptr).$set(x);
	};
	Value.prototype.SetPointer = function(x) { return this.$val.SetPointer(x); };
	Value.ptr.prototype.SetString = function(x) {
		var $ptr, v, x;
		v = this;
		new flag(v.flag).mustBeAssignable();
		new flag(v.flag).mustBe(24);
		(v.ptr).$set(x);
	};
	Value.prototype.SetString = function(x) { return this.$val.SetString(x); };
	Value.ptr.prototype.String = function() {
		var $ptr, _1, _r, k, v, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; $ptr = $f.$ptr; _1 = $f._1; _r = $f._r; k = $f.k; v = $f.v; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		v = this;
		k = new flag(v.flag).kind();
		_1 = k;
		if (_1 === (0)) {
			$s = -1; return "<invalid Value>";
		} else if (_1 === (24)) {
			$s = -1; return (v.ptr).$get();
		}
		_r = $clone(v, Value).Type().String(); /* */ $s = 1; case 1: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
		$s = -1; return "<" + _r + " Value>";
		/* */ } return; } if ($f === undefined) { $f = { $blk: Value.ptr.prototype.String }; } $f.$ptr = $ptr; $f._1 = _1; $f._r = _r; $f.k = k; $f.v = v; $f.$s = $s; $f.$r = $r; return $f;
	};
	Value.prototype.String = function() { return this.$val.String(); };
	Value.ptr.prototype.TryRecv = function() {
		var $ptr, _r, _tuple, ok, v, x, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; $ptr = $f.$ptr; _r = $f._r; _tuple = $f._tuple; ok = $f.ok; v = $f.v; x = $f.x; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		x = new Value.ptr(ptrType$1.nil, 0, 0);
		ok = false;
		v = this;
		new flag(v.flag).mustBe(18);
		new flag(v.flag).mustBeExported();
		_r = $clone(v, Value).recv(true); /* */ $s = 1; case 1: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
		_tuple = _r;
		x = _tuple[0];
		ok = _tuple[1];
		$s = -1; return [x, ok];
		/* */ } return; } if ($f === undefined) { $f = { $blk: Value.ptr.prototype.TryRecv }; } $f.$ptr = $ptr; $f._r = _r; $f._tuple = _tuple; $f.ok = ok; $f.v = v; $f.x = x; $f.$s = $s; $f.$r = $r; return $f;
	};
	Value.prototype.TryRecv = function() { return this.$val.TryRecv(); };
	Value.ptr.prototype.TrySend = function(x) {
		var $ptr, _r, v, x, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; $ptr = $f.$ptr; _r = $f._r; v = $f.v; x = $f.x; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		v = this;
		new flag(v.flag).mustBe(18);
		new flag(v.flag).mustBeExported();
		_r = $clone(v, Value).send($clone(x, Value), true); /* */ $s = 1; case 1: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
		$s = -1; return _r;
		/* */ } return; } if ($f === undefined) { $f = { $blk: Value.ptr.prototype.TrySend }; } $f.$ptr = $ptr; $f._r = _r; $f.v = v; $f.x = x; $f.$s = $s; $f.$r = $r; return $f;
	};
	Value.prototype.TrySend = function(x) { return this.$val.TrySend(x); };
	Value.ptr.prototype.Type = function() {
		var $ptr, f, i, m, m$1, tt, ut, v, x, x$1;
		v = this;
		f = v.flag;
		if (f === 0) {
			$panic(new ValueError.ptr("reflect.Value.Type", 0));
		}
		if (((f & 512) >>> 0) === 0) {
			return v.typ;
		}
		i = ((v.flag >> 0)) >> 10 >> 0;
		if (v.typ.Kind() === 20) {
			tt = (v.typ.kindType);
			if (((i >>> 0)) >= ((tt.methods.$length >>> 0))) {
				$panic(new $String("reflect: internal error: invalid method index"));
			}
			m = (x = tt.methods, ((i < 0 || i >= x.$length) ? ($throwRuntimeError("index out of range"), undefined) : x.$array[x.$offset + i]));
			return v.typ.typeOff(m.typ);
		}
		ut = v.typ.uncommon();
		if (ut === ptrType$6.nil || ((i >>> 0)) >= ((ut.mcount >>> 0))) {
			$panic(new $String("reflect: internal error: invalid method index"));
		}
		m$1 = $clone((x$1 = ut.methods(), ((i < 0 || i >= x$1.$length) ? ($throwRuntimeError("index out of range"), undefined) : x$1.$array[x$1.$offset + i])), method);
		return v.typ.typeOff(m$1.mtyp);
	};
	Value.prototype.Type = function() { return this.$val.Type(); };
	Value.ptr.prototype.Uint = function() {
		var $ptr, _1, k, p, v, x;
		v = this;
		k = new flag(v.flag).kind();
		p = v.ptr;
		_1 = k;
		if (_1 === (7)) {
			return (new $Uint64(0, (p).$get()));
		} else if (_1 === (8)) {
			return (new $Uint64(0, (p).$get()));
		} else if (_1 === (9)) {
			return (new $Uint64(0, (p).$get()));
		} else if (_1 === (10)) {
			return (new $Uint64(0, (p).$get()));
		} else if (_1 === (11)) {
			return (p).$get();
		} else if (_1 === (12)) {
			return ((x = (p).$get(), new $Uint64(0, x.constructor === Number ? x : 1)));
		}
		$panic(new ValueError.ptr("reflect.Value.Uint", new flag(v.flag).kind()));
	};
	Value.prototype.Uint = function() { return this.$val.Uint(); };
	Value.ptr.prototype.UnsafeAddr = function() {
		var $ptr, v;
		v = this;
		if (v.typ === ptrType$1.nil) {
			$panic(new ValueError.ptr("reflect.Value.UnsafeAddr", 0));
		}
		if (((v.flag & 256) >>> 0) === 0) {
			$panic(new $String("reflect.Value.UnsafeAddr of unaddressable value"));
		}
		return (v.ptr);
	};
	Value.prototype.UnsafeAddr = function() { return this.$val.UnsafeAddr(); };
	New = function(typ) {
		var $ptr, _r, _r$1, fl, ptr, typ, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; $ptr = $f.$ptr; _r = $f._r; _r$1 = $f._r$1; fl = $f.fl; ptr = $f.ptr; typ = $f.typ; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		if ($interfaceIsEqual(typ, $ifaceNil)) {
			$panic(new $String("reflect: New(nil)"));
		}
		ptr = unsafe_New($assertType(typ, ptrType$1));
		fl = 22;
		_r = typ.common(); /* */ $s = 1; case 1: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
		_r$1 = _r.ptrTo(); /* */ $s = 2; case 2: if($c) { $c = false; _r$1 = _r$1.$blk(); } if (_r$1 && _r$1.$blk !== undefined) { break s; }
		$s = -1; return new Value.ptr(_r$1, ptr, fl);
		/* */ } return; } if ($f === undefined) { $f = { $blk: New }; } $f.$ptr = $ptr; $f._r = _r; $f._r$1 = _r$1; $f.fl = fl; $f.ptr = ptr; $f.typ = typ; $f.$s = $s; $f.$r = $r; return $f;
	};
	$pkg.New = New;
	Value.ptr.prototype.assignTo = function(context, dst, target) {
		var $ptr, _r, _r$1, _r$2, _r$3, context, dst, fl, target, v, x, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; $ptr = $f.$ptr; _r = $f._r; _r$1 = $f._r$1; _r$2 = $f._r$2; _r$3 = $f._r$3; context = $f.context; dst = $f.dst; fl = $f.fl; target = $f.target; v = $f.v; x = $f.x; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		v = this;
		/* */ if (!((((v.flag & 512) >>> 0) === 0))) { $s = 1; continue; }
		/* */ $s = 2; continue;
		/* if (!((((v.flag & 512) >>> 0) === 0))) { */ case 1:
			_r = makeMethodValue(context, $clone(v, Value)); /* */ $s = 3; case 3: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
			v = _r;
		/* } */ case 2:
			_r$1 = directlyAssignable(dst, v.typ); /* */ $s = 8; case 8: if($c) { $c = false; _r$1 = _r$1.$blk(); } if (_r$1 && _r$1.$blk !== undefined) { break s; }
			/* */ if (_r$1) { $s = 5; continue; }
			/* */ if (implements$1(dst, v.typ)) { $s = 6; continue; }
			/* */ $s = 7; continue;
			/* if (_r$1) { */ case 5:
				v.typ = dst;
				fl = (v.flag & 480) >>> 0;
				fl = (fl | (((dst.Kind() >>> 0)))) >>> 0;
				$s = -1; return new Value.ptr(dst, v.ptr, fl);
			/* } else if (implements$1(dst, v.typ)) { */ case 6:
				if (target === 0) {
					target = unsafe_New(dst);
				}
				_r$2 = valueInterface($clone(v, Value), false); /* */ $s = 9; case 9: if($c) { $c = false; _r$2 = _r$2.$blk(); } if (_r$2 && _r$2.$blk !== undefined) { break s; }
				x = _r$2;
				_r$3 = dst.NumMethod(); /* */ $s = 13; case 13: if($c) { $c = false; _r$3 = _r$3.$blk(); } if (_r$3 && _r$3.$blk !== undefined) { break s; }
				/* */ if (_r$3 === 0) { $s = 10; continue; }
				/* */ $s = 11; continue;
				/* if (_r$3 === 0) { */ case 10:
					(target).$set(x);
					$s = 12; continue;
				/* } else { */ case 11:
					ifaceE2I(dst, x, target);
				/* } */ case 12:
				$s = -1; return new Value.ptr(dst, target, 148);
			/* } */ case 7:
		case 4:
		$panic(new $String(context + ": value of type " + v.typ.String() + " is not assignable to type " + dst.String()));
		$s = -1; return new Value.ptr(ptrType$1.nil, 0, 0);
		/* */ } return; } if ($f === undefined) { $f = { $blk: Value.ptr.prototype.assignTo }; } $f.$ptr = $ptr; $f._r = _r; $f._r$1 = _r$1; $f._r$2 = _r$2; $f._r$3 = _r$3; $f.context = context; $f.dst = dst; $f.fl = fl; $f.target = target; $f.v = v; $f.x = x; $f.$s = $s; $f.$r = $r; return $f;
	};
	Value.prototype.assignTo = function(context, dst, target) { return this.$val.assignTo(context, dst, target); };
	Value.ptr.prototype.Convert = function(t) {
		var $ptr, _r, _r$1, _r$2, _r$3, _r$4, op, t, v, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; $ptr = $f.$ptr; _r = $f._r; _r$1 = $f._r$1; _r$2 = $f._r$2; _r$3 = $f._r$3; _r$4 = $f._r$4; op = $f.op; t = $f.t; v = $f.v; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		v = this;
		/* */ if (!((((v.flag & 512) >>> 0) === 0))) { $s = 1; continue; }
		/* */ $s = 2; continue;
		/* if (!((((v.flag & 512) >>> 0) === 0))) { */ case 1:
			_r = makeMethodValue("Convert", $clone(v, Value)); /* */ $s = 3; case 3: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
			v = _r;
		/* } */ case 2:
		_r$1 = t.common(); /* */ $s = 4; case 4: if($c) { $c = false; _r$1 = _r$1.$blk(); } if (_r$1 && _r$1.$blk !== undefined) { break s; }
		_r$2 = convertOp(_r$1, v.typ); /* */ $s = 5; case 5: if($c) { $c = false; _r$2 = _r$2.$blk(); } if (_r$2 && _r$2.$blk !== undefined) { break s; }
		op = _r$2;
		/* */ if (op === $throwNilPointerError) { $s = 6; continue; }
		/* */ $s = 7; continue;
		/* if (op === $throwNilPointerError) { */ case 6:
			_r$3 = t.String(); /* */ $s = 8; case 8: if($c) { $c = false; _r$3 = _r$3.$blk(); } if (_r$3 && _r$3.$blk !== undefined) { break s; }
			$panic(new $String("reflect.Value.Convert: value of type " + v.typ.String() + " cannot be converted to type " + _r$3));
		/* } */ case 7:
		_r$4 = op($clone(v, Value), t); /* */ $s = 9; case 9: if($c) { $c = false; _r$4 = _r$4.$blk(); } if (_r$4 && _r$4.$blk !== undefined) { break s; }
		$s = -1; return _r$4;
		/* */ } return; } if ($f === undefined) { $f = { $blk: Value.ptr.prototype.Convert }; } $f.$ptr = $ptr; $f._r = _r; $f._r$1 = _r$1; $f._r$2 = _r$2; $f._r$3 = _r$3; $f._r$4 = _r$4; $f.op = op; $f.t = t; $f.v = v; $f.$s = $s; $f.$r = $r; return $f;
	};
	Value.prototype.Convert = function(t) { return this.$val.Convert(t); };
	convertOp = function(dst, src) {
		var $ptr, _1, _2, _3, _4, _5, _6, _7, _arg, _arg$1, _r, _r$1, _r$2, _r$3, _r$4, _r$5, _r$6, _r$7, _v, _v$1, _v$2, dst, src, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; $ptr = $f.$ptr; _1 = $f._1; _2 = $f._2; _3 = $f._3; _4 = $f._4; _5 = $f._5; _6 = $f._6; _7 = $f._7; _arg = $f._arg; _arg$1 = $f._arg$1; _r = $f._r; _r$1 = $f._r$1; _r$2 = $f._r$2; _r$3 = $f._r$3; _r$4 = $f._r$4; _r$5 = $f._r$5; _r$6 = $f._r$6; _r$7 = $f._r$7; _v = $f._v; _v$1 = $f._v$1; _v$2 = $f._v$2; dst = $f.dst; src = $f.src; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
			_1 = src.Kind();
			/* */ if ((_1 === (2)) || (_1 === (3)) || (_1 === (4)) || (_1 === (5)) || (_1 === (6))) { $s = 2; continue; }
			/* */ if ((_1 === (7)) || (_1 === (8)) || (_1 === (9)) || (_1 === (10)) || (_1 === (11)) || (_1 === (12))) { $s = 3; continue; }
			/* */ if ((_1 === (13)) || (_1 === (14))) { $s = 4; continue; }
			/* */ if ((_1 === (15)) || (_1 === (16))) { $s = 5; continue; }
			/* */ if (_1 === (24)) { $s = 6; continue; }
			/* */ if (_1 === (23)) { $s = 7; continue; }
			/* */ $s = 8; continue;
			/* if ((_1 === (2)) || (_1 === (3)) || (_1 === (4)) || (_1 === (5)) || (_1 === (6))) { */ case 2:
				_2 = dst.Kind();
				if ((_2 === (2)) || (_2 === (3)) || (_2 === (4)) || (_2 === (5)) || (_2 === (6)) || (_2 === (7)) || (_2 === (8)) || (_2 === (9)) || (_2 === (10)) || (_2 === (11)) || (_2 === (12))) {
					$s = -1; return cvtInt;
				} else if ((_2 === (13)) || (_2 === (14))) {
					$s = -1; return cvtIntFloat;
				} else if (_2 === (24)) {
					$s = -1; return cvtIntString;
				}
				$s = 8; continue;
			/* } else if ((_1 === (7)) || (_1 === (8)) || (_1 === (9)) || (_1 === (10)) || (_1 === (11)) || (_1 === (12))) { */ case 3:
				_3 = dst.Kind();
				if ((_3 === (2)) || (_3 === (3)) || (_3 === (4)) || (_3 === (5)) || (_3 === (6)) || (_3 === (7)) || (_3 === (8)) || (_3 === (9)) || (_3 === (10)) || (_3 === (11)) || (_3 === (12))) {
					$s = -1; return cvtUint;
				} else if ((_3 === (13)) || (_3 === (14))) {
					$s = -1; return cvtUintFloat;
				} else if (_3 === (24)) {
					$s = -1; return cvtUintString;
				}
				$s = 8; continue;
			/* } else if ((_1 === (13)) || (_1 === (14))) { */ case 4:
				_4 = dst.Kind();
				if ((_4 === (2)) || (_4 === (3)) || (_4 === (4)) || (_4 === (5)) || (_4 === (6))) {
					$s = -1; return cvtFloatInt;
				} else if ((_4 === (7)) || (_4 === (8)) || (_4 === (9)) || (_4 === (10)) || (_4 === (11)) || (_4 === (12))) {
					$s = -1; return cvtFloatUint;
				} else if ((_4 === (13)) || (_4 === (14))) {
					$s = -1; return cvtFloat;
				}
				$s = 8; continue;
			/* } else if ((_1 === (15)) || (_1 === (16))) { */ case 5:
				_5 = dst.Kind();
				if ((_5 === (15)) || (_5 === (16))) {
					$s = -1; return cvtComplex;
				}
				$s = 8; continue;
			/* } else if (_1 === (24)) { */ case 6:
				if (!(dst.Kind() === 23)) { _v = false; $s = 11; continue s; }
				_r = dst.Elem().PkgPath(); /* */ $s = 12; case 12: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
				_v = _r === ""; case 11:
				/* */ if (_v) { $s = 9; continue; }
				/* */ $s = 10; continue;
				/* if (_v) { */ case 9:
						_r$1 = dst.Elem().Kind(); /* */ $s = 14; case 14: if($c) { $c = false; _r$1 = _r$1.$blk(); } if (_r$1 && _r$1.$blk !== undefined) { break s; }
						_6 = _r$1;
						if (_6 === (8)) {
							$s = -1; return cvtStringBytes;
						} else if (_6 === (5)) {
							$s = -1; return cvtStringRunes;
						}
					case 13:
				/* } */ case 10:
				$s = 8; continue;
			/* } else if (_1 === (23)) { */ case 7:
				if (!(dst.Kind() === 24)) { _v$1 = false; $s = 17; continue s; }
				_r$2 = src.Elem().PkgPath(); /* */ $s = 18; case 18: if($c) { $c = false; _r$2 = _r$2.$blk(); } if (_r$2 && _r$2.$blk !== undefined) { break s; }
				_v$1 = _r$2 === ""; case 17:
				/* */ if (_v$1) { $s = 15; continue; }
				/* */ $s = 16; continue;
				/* if (_v$1) { */ case 15:
						_r$3 = src.Elem().Kind(); /* */ $s = 20; case 20: if($c) { $c = false; _r$3 = _r$3.$blk(); } if (_r$3 && _r$3.$blk !== undefined) { break s; }
						_7 = _r$3;
						if (_7 === (8)) {
							$s = -1; return cvtBytesString;
						} else if (_7 === (5)) {
							$s = -1; return cvtRunesString;
						}
					case 19:
				/* } */ case 16:
			/* } */ case 8:
		case 1:
		_r$4 = haveIdenticalUnderlyingType(dst, src, false); /* */ $s = 23; case 23: if($c) { $c = false; _r$4 = _r$4.$blk(); } if (_r$4 && _r$4.$blk !== undefined) { break s; }
		/* */ if (_r$4) { $s = 21; continue; }
		/* */ $s = 22; continue;
		/* if (_r$4) { */ case 21:
			$s = -1; return cvtDirect;
		/* } */ case 22:
		if (!((dst.Kind() === 22) && dst.Name() === "" && (src.Kind() === 22) && src.Name() === "")) { _v$2 = false; $s = 26; continue s; }
		_r$5 = dst.Elem().common(); /* */ $s = 27; case 27: if($c) { $c = false; _r$5 = _r$5.$blk(); } if (_r$5 && _r$5.$blk !== undefined) { break s; }
		_arg = _r$5;
		_r$6 = src.Elem().common(); /* */ $s = 28; case 28: if($c) { $c = false; _r$6 = _r$6.$blk(); } if (_r$6 && _r$6.$blk !== undefined) { break s; }
		_arg$1 = _r$6;
		_r$7 = haveIdenticalUnderlyingType(_arg, _arg$1, false); /* */ $s = 29; case 29: if($c) { $c = false; _r$7 = _r$7.$blk(); } if (_r$7 && _r$7.$blk !== undefined) { break s; }
		_v$2 = _r$7; case 26:
		/* */ if (_v$2) { $s = 24; continue; }
		/* */ $s = 25; continue;
		/* if (_v$2) { */ case 24:
			$s = -1; return cvtDirect;
		/* } */ case 25:
		if (implements$1(dst, src)) {
			if (src.Kind() === 20) {
				$s = -1; return cvtI2I;
			}
			$s = -1; return cvtT2I;
		}
		$s = -1; return $throwNilPointerError;
		/* */ } return; } if ($f === undefined) { $f = { $blk: convertOp }; } $f.$ptr = $ptr; $f._1 = _1; $f._2 = _2; $f._3 = _3; $f._4 = _4; $f._5 = _5; $f._6 = _6; $f._7 = _7; $f._arg = _arg; $f._arg$1 = _arg$1; $f._r = _r; $f._r$1 = _r$1; $f._r$2 = _r$2; $f._r$3 = _r$3; $f._r$4 = _r$4; $f._r$5 = _r$5; $f._r$6 = _r$6; $f._r$7 = _r$7; $f._v = _v; $f._v$1 = _v$1; $f._v$2 = _v$2; $f.dst = dst; $f.src = src; $f.$s = $s; $f.$r = $r; return $f;
	};
	makeFloat = function(f, v, t) {
		var $ptr, _1, _r, f, ptr, t, typ, v, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; $ptr = $f.$ptr; _1 = $f._1; _r = $f._r; f = $f.f; ptr = $f.ptr; t = $f.t; typ = $f.typ; v = $f.v; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		_r = t.common(); /* */ $s = 1; case 1: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
		typ = _r;
		ptr = unsafe_New(typ);
		_1 = typ.size;
		if (_1 === (4)) {
			(ptr).$set(($fround(v)));
		} else if (_1 === (8)) {
			(ptr).$set(v);
		}
		$s = -1; return new Value.ptr(typ, ptr, (((f | 128) >>> 0) | ((typ.Kind() >>> 0))) >>> 0);
		/* */ } return; } if ($f === undefined) { $f = { $blk: makeFloat }; } $f.$ptr = $ptr; $f._1 = _1; $f._r = _r; $f.f = f; $f.ptr = ptr; $f.t = t; $f.typ = typ; $f.v = v; $f.$s = $s; $f.$r = $r; return $f;
	};
	makeComplex = function(f, v, t) {
		var $ptr, _1, _r, f, ptr, t, typ, v, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; $ptr = $f.$ptr; _1 = $f._1; _r = $f._r; f = $f.f; ptr = $f.ptr; t = $f.t; typ = $f.typ; v = $f.v; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		_r = t.common(); /* */ $s = 1; case 1: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
		typ = _r;
		ptr = unsafe_New(typ);
		_1 = typ.size;
		if (_1 === (8)) {
			(ptr).$set((new $Complex64(v.$real, v.$imag)));
		} else if (_1 === (16)) {
			(ptr).$set(v);
		}
		$s = -1; return new Value.ptr(typ, ptr, (((f | 128) >>> 0) | ((typ.Kind() >>> 0))) >>> 0);
		/* */ } return; } if ($f === undefined) { $f = { $blk: makeComplex }; } $f.$ptr = $ptr; $f._1 = _1; $f._r = _r; $f.f = f; $f.ptr = ptr; $f.t = t; $f.typ = typ; $f.v = v; $f.$s = $s; $f.$r = $r; return $f;
	};
	makeString = function(f, v, t) {
		var $ptr, _r, _r$1, f, ret, t, v, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; $ptr = $f.$ptr; _r = $f._r; _r$1 = $f._r$1; f = $f.f; ret = $f.ret; t = $f.t; v = $f.v; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		_r = New(t); /* */ $s = 1; case 1: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
		_r$1 = $clone(_r, Value).Elem(); /* */ $s = 2; case 2: if($c) { $c = false; _r$1 = _r$1.$blk(); } if (_r$1 && _r$1.$blk !== undefined) { break s; }
		ret = _r$1;
		$clone(ret, Value).SetString(v);
		ret.flag = (((ret.flag & ~256) >>> 0) | f) >>> 0;
		$s = -1; return ret;
		/* */ } return; } if ($f === undefined) { $f = { $blk: makeString }; } $f.$ptr = $ptr; $f._r = _r; $f._r$1 = _r$1; $f.f = f; $f.ret = ret; $f.t = t; $f.v = v; $f.$s = $s; $f.$r = $r; return $f;
	};
	makeBytes = function(f, v, t) {
		var $ptr, _r, _r$1, f, ret, t, v, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; $ptr = $f.$ptr; _r = $f._r; _r$1 = $f._r$1; f = $f.f; ret = $f.ret; t = $f.t; v = $f.v; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		_r = New(t); /* */ $s = 1; case 1: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
		_r$1 = $clone(_r, Value).Elem(); /* */ $s = 2; case 2: if($c) { $c = false; _r$1 = _r$1.$blk(); } if (_r$1 && _r$1.$blk !== undefined) { break s; }
		ret = _r$1;
		$r = $clone(ret, Value).SetBytes(v); /* */ $s = 3; case 3: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
		ret.flag = (((ret.flag & ~256) >>> 0) | f) >>> 0;
		$s = -1; return ret;
		/* */ } return; } if ($f === undefined) { $f = { $blk: makeBytes }; } $f.$ptr = $ptr; $f._r = _r; $f._r$1 = _r$1; $f.f = f; $f.ret = ret; $f.t = t; $f.v = v; $f.$s = $s; $f.$r = $r; return $f;
	};
	makeRunes = function(f, v, t) {
		var $ptr, _r, _r$1, f, ret, t, v, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; $ptr = $f.$ptr; _r = $f._r; _r$1 = $f._r$1; f = $f.f; ret = $f.ret; t = $f.t; v = $f.v; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		_r = New(t); /* */ $s = 1; case 1: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
		_r$1 = $clone(_r, Value).Elem(); /* */ $s = 2; case 2: if($c) { $c = false; _r$1 = _r$1.$blk(); } if (_r$1 && _r$1.$blk !== undefined) { break s; }
		ret = _r$1;
		$r = $clone(ret, Value).setRunes(v); /* */ $s = 3; case 3: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
		ret.flag = (((ret.flag & ~256) >>> 0) | f) >>> 0;
		$s = -1; return ret;
		/* */ } return; } if ($f === undefined) { $f = { $blk: makeRunes }; } $f.$ptr = $ptr; $f._r = _r; $f._r$1 = _r$1; $f.f = f; $f.ret = ret; $f.t = t; $f.v = v; $f.$s = $s; $f.$r = $r; return $f;
	};
	cvtInt = function(v, t) {
		var $ptr, _r, t, v, x, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; $ptr = $f.$ptr; _r = $f._r; t = $f.t; v = $f.v; x = $f.x; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		_r = makeInt((v.flag & 96) >>> 0, ((x = $clone(v, Value).Int(), new $Uint64(x.$high, x.$low))), t); /* */ $s = 1; case 1: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
		$s = -1; return _r;
		/* */ } return; } if ($f === undefined) { $f = { $blk: cvtInt }; } $f.$ptr = $ptr; $f._r = _r; $f.t = t; $f.v = v; $f.x = x; $f.$s = $s; $f.$r = $r; return $f;
	};
	cvtUint = function(v, t) {
		var $ptr, _r, t, v, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; $ptr = $f.$ptr; _r = $f._r; t = $f.t; v = $f.v; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		_r = makeInt((v.flag & 96) >>> 0, $clone(v, Value).Uint(), t); /* */ $s = 1; case 1: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
		$s = -1; return _r;
		/* */ } return; } if ($f === undefined) { $f = { $blk: cvtUint }; } $f.$ptr = $ptr; $f._r = _r; $f.t = t; $f.v = v; $f.$s = $s; $f.$r = $r; return $f;
	};
	cvtFloatInt = function(v, t) {
		var $ptr, _r, t, v, x, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; $ptr = $f.$ptr; _r = $f._r; t = $f.t; v = $f.v; x = $f.x; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		_r = makeInt((v.flag & 96) >>> 0, ((x = (new $Int64(0, $clone(v, Value).Float())), new $Uint64(x.$high, x.$low))), t); /* */ $s = 1; case 1: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
		$s = -1; return _r;
		/* */ } return; } if ($f === undefined) { $f = { $blk: cvtFloatInt }; } $f.$ptr = $ptr; $f._r = _r; $f.t = t; $f.v = v; $f.x = x; $f.$s = $s; $f.$r = $r; return $f;
	};
	cvtFloatUint = function(v, t) {
		var $ptr, _r, t, v, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; $ptr = $f.$ptr; _r = $f._r; t = $f.t; v = $f.v; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		_r = makeInt((v.flag & 96) >>> 0, (new $Uint64(0, $clone(v, Value).Float())), t); /* */ $s = 1; case 1: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
		$s = -1; return _r;
		/* */ } return; } if ($f === undefined) { $f = { $blk: cvtFloatUint }; } $f.$ptr = $ptr; $f._r = _r; $f.t = t; $f.v = v; $f.$s = $s; $f.$r = $r; return $f;
	};
	cvtIntFloat = function(v, t) {
		var $ptr, _r, t, v, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; $ptr = $f.$ptr; _r = $f._r; t = $f.t; v = $f.v; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		_r = makeFloat((v.flag & 96) >>> 0, ($flatten64($clone(v, Value).Int())), t); /* */ $s = 1; case 1: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
		$s = -1; return _r;
		/* */ } return; } if ($f === undefined) { $f = { $blk: cvtIntFloat }; } $f.$ptr = $ptr; $f._r = _r; $f.t = t; $f.v = v; $f.$s = $s; $f.$r = $r; return $f;
	};
	cvtUintFloat = function(v, t) {
		var $ptr, _r, t, v, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; $ptr = $f.$ptr; _r = $f._r; t = $f.t; v = $f.v; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		_r = makeFloat((v.flag & 96) >>> 0, ($flatten64($clone(v, Value).Uint())), t); /* */ $s = 1; case 1: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
		$s = -1; return _r;
		/* */ } return; } if ($f === undefined) { $f = { $blk: cvtUintFloat }; } $f.$ptr = $ptr; $f._r = _r; $f.t = t; $f.v = v; $f.$s = $s; $f.$r = $r; return $f;
	};
	cvtFloat = function(v, t) {
		var $ptr, _r, t, v, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; $ptr = $f.$ptr; _r = $f._r; t = $f.t; v = $f.v; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		_r = makeFloat((v.flag & 96) >>> 0, $clone(v, Value).Float(), t); /* */ $s = 1; case 1: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
		$s = -1; return _r;
		/* */ } return; } if ($f === undefined) { $f = { $blk: cvtFloat }; } $f.$ptr = $ptr; $f._r = _r; $f.t = t; $f.v = v; $f.$s = $s; $f.$r = $r; return $f;
	};
	cvtComplex = function(v, t) {
		var $ptr, _r, t, v, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; $ptr = $f.$ptr; _r = $f._r; t = $f.t; v = $f.v; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		_r = makeComplex((v.flag & 96) >>> 0, $clone(v, Value).Complex(), t); /* */ $s = 1; case 1: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
		$s = -1; return _r;
		/* */ } return; } if ($f === undefined) { $f = { $blk: cvtComplex }; } $f.$ptr = $ptr; $f._r = _r; $f.t = t; $f.v = v; $f.$s = $s; $f.$r = $r; return $f;
	};
	cvtIntString = function(v, t) {
		var $ptr, _r, t, v, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; $ptr = $f.$ptr; _r = $f._r; t = $f.t; v = $f.v; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		_r = makeString((v.flag & 96) >>> 0, ($encodeRune($clone(v, Value).Int().$low)), t); /* */ $s = 1; case 1: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
		$s = -1; return _r;
		/* */ } return; } if ($f === undefined) { $f = { $blk: cvtIntString }; } $f.$ptr = $ptr; $f._r = _r; $f.t = t; $f.v = v; $f.$s = $s; $f.$r = $r; return $f;
	};
	cvtUintString = function(v, t) {
		var $ptr, _r, t, v, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; $ptr = $f.$ptr; _r = $f._r; t = $f.t; v = $f.v; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		_r = makeString((v.flag & 96) >>> 0, ($encodeRune($clone(v, Value).Uint().$low)), t); /* */ $s = 1; case 1: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
		$s = -1; return _r;
		/* */ } return; } if ($f === undefined) { $f = { $blk: cvtUintString }; } $f.$ptr = $ptr; $f._r = _r; $f.t = t; $f.v = v; $f.$s = $s; $f.$r = $r; return $f;
	};
	cvtBytesString = function(v, t) {
		var $ptr, _arg, _arg$1, _arg$2, _r, _r$1, t, v, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; $ptr = $f.$ptr; _arg = $f._arg; _arg$1 = $f._arg$1; _arg$2 = $f._arg$2; _r = $f._r; _r$1 = $f._r$1; t = $f.t; v = $f.v; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		_arg = (v.flag & 96) >>> 0;
		_r = $clone(v, Value).Bytes(); /* */ $s = 1; case 1: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
		_arg$1 = ($bytesToString(_r));
		_arg$2 = t;
		_r$1 = makeString(_arg, _arg$1, _arg$2); /* */ $s = 2; case 2: if($c) { $c = false; _r$1 = _r$1.$blk(); } if (_r$1 && _r$1.$blk !== undefined) { break s; }
		$s = -1; return _r$1;
		/* */ } return; } if ($f === undefined) { $f = { $blk: cvtBytesString }; } $f.$ptr = $ptr; $f._arg = _arg; $f._arg$1 = _arg$1; $f._arg$2 = _arg$2; $f._r = _r; $f._r$1 = _r$1; $f.t = t; $f.v = v; $f.$s = $s; $f.$r = $r; return $f;
	};
	cvtStringBytes = function(v, t) {
		var $ptr, _arg, _arg$1, _arg$2, _r, _r$1, t, v, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; $ptr = $f.$ptr; _arg = $f._arg; _arg$1 = $f._arg$1; _arg$2 = $f._arg$2; _r = $f._r; _r$1 = $f._r$1; t = $f.t; v = $f.v; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		_arg = (v.flag & 96) >>> 0;
		_r = $clone(v, Value).String(); /* */ $s = 1; case 1: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
		_arg$1 = (new sliceType$16($stringToBytes(_r)));
		_arg$2 = t;
		_r$1 = makeBytes(_arg, _arg$1, _arg$2); /* */ $s = 2; case 2: if($c) { $c = false; _r$1 = _r$1.$blk(); } if (_r$1 && _r$1.$blk !== undefined) { break s; }
		$s = -1; return _r$1;
		/* */ } return; } if ($f === undefined) { $f = { $blk: cvtStringBytes }; } $f.$ptr = $ptr; $f._arg = _arg; $f._arg$1 = _arg$1; $f._arg$2 = _arg$2; $f._r = _r; $f._r$1 = _r$1; $f.t = t; $f.v = v; $f.$s = $s; $f.$r = $r; return $f;
	};
	cvtRunesString = function(v, t) {
		var $ptr, _arg, _arg$1, _arg$2, _r, _r$1, t, v, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; $ptr = $f.$ptr; _arg = $f._arg; _arg$1 = $f._arg$1; _arg$2 = $f._arg$2; _r = $f._r; _r$1 = $f._r$1; t = $f.t; v = $f.v; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		_arg = (v.flag & 96) >>> 0;
		_r = $clone(v, Value).runes(); /* */ $s = 1; case 1: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
		_arg$1 = ($runesToString(_r));
		_arg$2 = t;
		_r$1 = makeString(_arg, _arg$1, _arg$2); /* */ $s = 2; case 2: if($c) { $c = false; _r$1 = _r$1.$blk(); } if (_r$1 && _r$1.$blk !== undefined) { break s; }
		$s = -1; return _r$1;
		/* */ } return; } if ($f === undefined) { $f = { $blk: cvtRunesString }; } $f.$ptr = $ptr; $f._arg = _arg; $f._arg$1 = _arg$1; $f._arg$2 = _arg$2; $f._r = _r; $f._r$1 = _r$1; $f.t = t; $f.v = v; $f.$s = $s; $f.$r = $r; return $f;
	};
	cvtStringRunes = function(v, t) {
		var $ptr, _arg, _arg$1, _arg$2, _r, _r$1, t, v, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; $ptr = $f.$ptr; _arg = $f._arg; _arg$1 = $f._arg$1; _arg$2 = $f._arg$2; _r = $f._r; _r$1 = $f._r$1; t = $f.t; v = $f.v; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		_arg = (v.flag & 96) >>> 0;
		_r = $clone(v, Value).String(); /* */ $s = 1; case 1: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
		_arg$1 = (new sliceType$18($stringToRunes(_r)));
		_arg$2 = t;
		_r$1 = makeRunes(_arg, _arg$1, _arg$2); /* */ $s = 2; case 2: if($c) { $c = false; _r$1 = _r$1.$blk(); } if (_r$1 && _r$1.$blk !== undefined) { break s; }
		$s = -1; return _r$1;
		/* */ } return; } if ($f === undefined) { $f = { $blk: cvtStringRunes }; } $f.$ptr = $ptr; $f._arg = _arg; $f._arg$1 = _arg$1; $f._arg$2 = _arg$2; $f._r = _r; $f._r$1 = _r$1; $f.t = t; $f.v = v; $f.$s = $s; $f.$r = $r; return $f;
	};
	cvtT2I = function(v, typ) {
		var $ptr, _r, _r$1, _r$2, _r$3, _r$4, target, typ, v, x, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; $ptr = $f.$ptr; _r = $f._r; _r$1 = $f._r$1; _r$2 = $f._r$2; _r$3 = $f._r$3; _r$4 = $f._r$4; target = $f.target; typ = $f.typ; v = $f.v; x = $f.x; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		_r = typ.common(); /* */ $s = 1; case 1: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
		_r$1 = unsafe_New(_r); /* */ $s = 2; case 2: if($c) { $c = false; _r$1 = _r$1.$blk(); } if (_r$1 && _r$1.$blk !== undefined) { break s; }
		target = _r$1;
		_r$2 = valueInterface($clone(v, Value), false); /* */ $s = 3; case 3: if($c) { $c = false; _r$2 = _r$2.$blk(); } if (_r$2 && _r$2.$blk !== undefined) { break s; }
		x = _r$2;
		_r$3 = typ.NumMethod(); /* */ $s = 7; case 7: if($c) { $c = false; _r$3 = _r$3.$blk(); } if (_r$3 && _r$3.$blk !== undefined) { break s; }
		/* */ if (_r$3 === 0) { $s = 4; continue; }
		/* */ $s = 5; continue;
		/* if (_r$3 === 0) { */ case 4:
			(target).$set(x);
			$s = 6; continue;
		/* } else { */ case 5:
			ifaceE2I($assertType(typ, ptrType$1), x, target);
		/* } */ case 6:
		_r$4 = typ.common(); /* */ $s = 8; case 8: if($c) { $c = false; _r$4 = _r$4.$blk(); } if (_r$4 && _r$4.$blk !== undefined) { break s; }
		$s = -1; return new Value.ptr(_r$4, target, (((((v.flag & 96) >>> 0) | 128) >>> 0) | 20) >>> 0);
		/* */ } return; } if ($f === undefined) { $f = { $blk: cvtT2I }; } $f.$ptr = $ptr; $f._r = _r; $f._r$1 = _r$1; $f._r$2 = _r$2; $f._r$3 = _r$3; $f._r$4 = _r$4; $f.target = target; $f.typ = typ; $f.v = v; $f.x = x; $f.$s = $s; $f.$r = $r; return $f;
	};
	cvtI2I = function(v, typ) {
		var $ptr, _r, _r$1, _r$2, ret, typ, v, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; $ptr = $f.$ptr; _r = $f._r; _r$1 = $f._r$1; _r$2 = $f._r$2; ret = $f.ret; typ = $f.typ; v = $f.v; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		/* */ if ($clone(v, Value).IsNil()) { $s = 1; continue; }
		/* */ $s = 2; continue;
		/* if ($clone(v, Value).IsNil()) { */ case 1:
			_r = Zero(typ); /* */ $s = 3; case 3: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
			ret = _r;
			ret.flag = (ret.flag | (((v.flag & 96) >>> 0))) >>> 0;
			$s = -1; return ret;
		/* } */ case 2:
		_r$1 = $clone(v, Value).Elem(); /* */ $s = 4; case 4: if($c) { $c = false; _r$1 = _r$1.$blk(); } if (_r$1 && _r$1.$blk !== undefined) { break s; }
		_r$2 = cvtT2I($clone(_r$1, Value), typ); /* */ $s = 5; case 5: if($c) { $c = false; _r$2 = _r$2.$blk(); } if (_r$2 && _r$2.$blk !== undefined) { break s; }
		$s = -1; return _r$2;
		/* */ } return; } if ($f === undefined) { $f = { $blk: cvtI2I }; } $f.$ptr = $ptr; $f._r = _r; $f._r$1 = _r$1; $f._r$2 = _r$2; $f.ret = ret; $f.typ = typ; $f.v = v; $f.$s = $s; $f.$r = $r; return $f;
	};
	ptrType$6.methods = [{prop: "methods", name: "methods", pkg: "reflect", typ: $funcType([], [sliceType$3], false)}];
	ptrType$17.methods = [{prop: "in$", name: "in", pkg: "reflect", typ: $funcType([], [sliceType$2], false)}, {prop: "out", name: "out", pkg: "reflect", typ: $funcType([], [sliceType$2], false)}];
	name.methods = [{prop: "name", name: "name", pkg: "reflect", typ: $funcType([], [$String], false)}, {prop: "tag", name: "tag", pkg: "reflect", typ: $funcType([], [$String], false)}, {prop: "pkgPath", name: "pkgPath", pkg: "reflect", typ: $funcType([], [$String], false)}, {prop: "isExported", name: "isExported", pkg: "reflect", typ: $funcType([], [$Bool], false)}, {prop: "data", name: "data", pkg: "reflect", typ: $funcType([$Int], [ptrType$5], false)}, {prop: "nameLen", name: "nameLen", pkg: "reflect", typ: $funcType([], [$Int], false)}, {prop: "tagLen", name: "tagLen", pkg: "reflect", typ: $funcType([], [$Int], false)}];
	Kind.methods = [{prop: "String", name: "String", pkg: "", typ: $funcType([], [$String], false)}];
	ptrType$1.methods = [{prop: "uncommon", name: "uncommon", pkg: "reflect", typ: $funcType([], [ptrType$6], false)}, {prop: "nameOff", name: "nameOff", pkg: "reflect", typ: $funcType([nameOff], [name], false)}, {prop: "typeOff", name: "typeOff", pkg: "reflect", typ: $funcType([typeOff], [ptrType$1], false)}, {prop: "ptrTo", name: "ptrTo", pkg: "reflect", typ: $funcType([], [ptrType$1], false)}, {prop: "pointers", name: "pointers", pkg: "reflect", typ: $funcType([], [$Bool], false)}, {prop: "Comparable", name: "Comparable", pkg: "", typ: $funcType([], [$Bool], false)}, {prop: "Method", name: "Method", pkg: "", typ: $funcType([$Int], [Method], false)}, {prop: "textOff", name: "textOff", pkg: "reflect", typ: $funcType([textOff], [$UnsafePointer], false)}, {prop: "String", name: "String", pkg: "", typ: $funcType([], [$String], false)}, {prop: "Size", name: "Size", pkg: "", typ: $funcType([], [$Uintptr], false)}, {prop: "Bits", name: "Bits", pkg: "", typ: $funcType([], [$Int], false)}, {prop: "Align", name: "Align", pkg: "", typ: $funcType([], [$Int], false)}, {prop: "FieldAlign", name: "FieldAlign", pkg: "", typ: $funcType([], [$Int], false)}, {prop: "Kind", name: "Kind", pkg: "", typ: $funcType([], [Kind], false)}, {prop: "common", name: "common", pkg: "reflect", typ: $funcType([], [ptrType$1], false)}, {prop: "exportedMethods", name: "exportedMethods", pkg: "reflect", typ: $funcType([], [sliceType$3], false)}, {prop: "NumMethod", name: "NumMethod", pkg: "", typ: $funcType([], [$Int], false)}, {prop: "MethodByName", name: "MethodByName", pkg: "", typ: $funcType([$String], [Method, $Bool], false)}, {prop: "PkgPath", name: "PkgPath", pkg: "", typ: $funcType([], [$String], false)}, {prop: "Name", name: "Name", pkg: "", typ: $funcType([], [$String], false)}, {prop: "ChanDir", name: "ChanDir", pkg: "", typ: $funcType([], [ChanDir], false)}, {prop: "IsVariadic", name: "IsVariadic", pkg: "", typ: $funcType([], [$Bool], false)}, {prop: "Elem", name: "Elem", pkg: "", typ: $funcType([], [Type], false)}, {prop: "Field", name: "Field", pkg: "", typ: $funcType([$Int], [StructField], false)}, {prop: "FieldByIndex", name: "FieldByIndex", pkg: "", typ: $funcType([sliceType$14], [StructField], false)}, {prop: "FieldByName", name: "FieldByName", pkg: "", typ: $funcType([$String], [StructField, $Bool], false)}, {prop: "FieldByNameFunc", name: "FieldByNameFunc", pkg: "", typ: $funcType([funcType$3], [StructField, $Bool], false)}, {prop: "In", name: "In", pkg: "", typ: $funcType([$Int], [Type], false)}, {prop: "Key", name: "Key", pkg: "", typ: $funcType([], [Type], false)}, {prop: "Len", name: "Len", pkg: "", typ: $funcType([], [$Int], false)}, {prop: "NumField", name: "NumField", pkg: "", typ: $funcType([], [$Int], false)}, {prop: "NumIn", name: "NumIn", pkg: "", typ: $funcType([], [$Int], false)}, {prop: "NumOut", name: "NumOut", pkg: "", typ: $funcType([], [$Int], false)}, {prop: "Out", name: "Out", pkg: "", typ: $funcType([$Int], [Type], false)}, {prop: "Implements", name: "Implements", pkg: "", typ: $funcType([Type], [$Bool], false)}, {prop: "AssignableTo", name: "AssignableTo", pkg: "", typ: $funcType([Type], [$Bool], false)}, {prop: "ConvertibleTo", name: "ConvertibleTo", pkg: "", typ: $funcType([Type], [$Bool], false)}];
	ChanDir.methods = [{prop: "String", name: "String", pkg: "", typ: $funcType([], [$String], false)}];
	ptrType$8.methods = [{prop: "Method", name: "Method", pkg: "", typ: $funcType([$Int], [Method], false)}, {prop: "NumMethod", name: "NumMethod", pkg: "", typ: $funcType([], [$Int], false)}, {prop: "MethodByName", name: "MethodByName", pkg: "", typ: $funcType([$String], [Method, $Bool], false)}];
	ptrType$10.methods = [{prop: "Field", name: "Field", pkg: "", typ: $funcType([$Int], [StructField], false)}, {prop: "FieldByIndex", name: "FieldByIndex", pkg: "", typ: $funcType([sliceType$14], [StructField], false)}, {prop: "FieldByNameFunc", name: "FieldByNameFunc", pkg: "", typ: $funcType([funcType$3], [StructField, $Bool], false)}, {prop: "FieldByName", name: "FieldByName", pkg: "", typ: $funcType([$String], [StructField, $Bool], false)}];
	StructTag.methods = [{prop: "Get", name: "Get", pkg: "", typ: $funcType([$String], [$String], false)}, {prop: "Lookup", name: "Lookup", pkg: "", typ: $funcType([$String], [$String, $Bool], false)}];
	Value.methods = [{prop: "object", name: "object", pkg: "reflect", typ: $funcType([], [ptrType$3], false)}, {prop: "call", name: "call", pkg: "reflect", typ: $funcType([$String, sliceType$10], [sliceType$10], false)}, {prop: "Cap", name: "Cap", pkg: "", typ: $funcType([], [$Int], false)}, {prop: "Elem", name: "Elem", pkg: "", typ: $funcType([], [Value], false)}, {prop: "Field", name: "Field", pkg: "", typ: $funcType([$Int], [Value], false)}, {prop: "Index", name: "Index", pkg: "", typ: $funcType([$Int], [Value], false)}, {prop: "InterfaceData", name: "InterfaceData", pkg: "", typ: $funcType([], [arrayType$12], false)}, {prop: "IsNil", name: "IsNil", pkg: "", typ: $funcType([], [$Bool], false)}, {prop: "Len", name: "Len", pkg: "", typ: $funcType([], [$Int], false)}, {prop: "Pointer", name: "Pointer", pkg: "", typ: $funcType([], [$Uintptr], false)}, {prop: "Set", name: "Set", pkg: "", typ: $funcType([Value], [], false)}, {prop: "SetBytes", name: "SetBytes", pkg: "", typ: $funcType([sliceType$16], [], false)}, {prop: "SetCap", name: "SetCap", pkg: "", typ: $funcType([$Int], [], false)}, {prop: "SetLen", name: "SetLen", pkg: "", typ: $funcType([$Int], [], false)}, {prop: "Slice", name: "Slice", pkg: "", typ: $funcType([$Int, $Int], [Value], false)}, {prop: "Slice3", name: "Slice3", pkg: "", typ: $funcType([$Int, $Int, $Int], [Value], false)}, {prop: "Close", name: "Close", pkg: "", typ: $funcType([], [], false)}, {prop: "pointer", name: "pointer", pkg: "reflect", typ: $funcType([], [$UnsafePointer], false)}, {prop: "Addr", name: "Addr", pkg: "", typ: $funcType([], [Value], false)}, {prop: "Bool", name: "Bool", pkg: "", typ: $funcType([], [$Bool], false)}, {prop: "Bytes", name: "Bytes", pkg: "", typ: $funcType([], [sliceType$16], false)}, {prop: "runes", name: "runes", pkg: "reflect", typ: $funcType([], [sliceType$18], false)}, {prop: "CanAddr", name: "CanAddr", pkg: "", typ: $funcType([], [$Bool], false)}, {prop: "CanSet", name: "CanSet", pkg: "", typ: $funcType([], [$Bool], false)}, {prop: "Call", name: "Call", pkg: "", typ: $funcType([sliceType$10], [sliceType$10], false)}, {prop: "CallSlice", name: "CallSlice", pkg: "", typ: $funcType([sliceType$10], [sliceType$10], false)}, {prop: "Complex", name: "Complex", pkg: "", typ: $funcType([], [$Complex128], false)}, {prop: "FieldByIndex", name: "FieldByIndex", pkg: "", typ: $funcType([sliceType$14], [Value], false)}, {prop: "FieldByName", name: "FieldByName", pkg: "", typ: $funcType([$String], [Value], false)}, {prop: "FieldByNameFunc", name: "FieldByNameFunc", pkg: "", typ: $funcType([funcType$3], [Value], false)}, {prop: "Float", name: "Float", pkg: "", typ: $funcType([], [$Float64], false)}, {prop: "Int", name: "Int", pkg: "", typ: $funcType([], [$Int64], false)}, {prop: "CanInterface", name: "CanInterface", pkg: "", typ: $funcType([], [$Bool], false)}, {prop: "Interface", name: "Interface", pkg: "", typ: $funcType([], [$emptyInterface], false)}, {prop: "IsValid", name: "IsValid", pkg: "", typ: $funcType([], [$Bool], false)}, {prop: "Kind", name: "Kind", pkg: "", typ: $funcType([], [Kind], false)}, {prop: "MapIndex", name: "MapIndex", pkg: "", typ: $funcType([Value], [Value], false)}, {prop: "MapKeys", name: "MapKeys", pkg: "", typ: $funcType([], [sliceType$10], false)}, {prop: "Method", name: "Method", pkg: "", typ: $funcType([$Int], [Value], false)}, {prop: "NumMethod", name: "NumMethod", pkg: "", typ: $funcType([], [$Int], false)}, {prop: "MethodByName", name: "MethodByName", pkg: "", typ: $funcType([$String], [Value], false)}, {prop: "NumField", name: "NumField", pkg: "", typ: $funcType([], [$Int], false)}, {prop: "OverflowComplex", name: "OverflowComplex", pkg: "", typ: $funcType([$Complex128], [$Bool], false)}, {prop: "OverflowFloat", name: "OverflowFloat", pkg: "", typ: $funcType([$Float64], [$Bool], false)}, {prop: "OverflowInt", name: "OverflowInt", pkg: "", typ: $funcType([$Int64], [$Bool], false)}, {prop: "OverflowUint", name: "OverflowUint", pkg: "", typ: $funcType([$Uint64], [$Bool], false)}, {prop: "Recv", name: "Recv", pkg: "", typ: $funcType([], [Value, $Bool], false)}, {prop: "recv", name: "recv", pkg: "reflect", typ: $funcType([$Bool], [Value, $Bool], false)}, {prop: "Send", name: "Send", pkg: "", typ: $funcType([Value], [], false)}, {prop: "send", name: "send", pkg: "reflect", typ: $funcType([Value, $Bool], [$Bool], false)}, {prop: "SetBool", name: "SetBool", pkg: "", typ: $funcType([$Bool], [], false)}, {prop: "setRunes", name: "setRunes", pkg: "reflect", typ: $funcType([sliceType$18], [], false)}, {prop: "SetComplex", name: "SetComplex", pkg: "", typ: $funcType([$Complex128], [], false)}, {prop: "SetFloat", name: "SetFloat", pkg: "", typ: $funcType([$Float64], [], false)}, {prop: "SetInt", name: "SetInt", pkg: "", typ: $funcType([$Int64], [], false)}, {prop: "SetMapIndex", name: "SetMapIndex", pkg: "", typ: $funcType([Value, Value], [], false)}, {prop: "SetUint", name: "SetUint", pkg: "", typ: $funcType([$Uint64], [], false)}, {prop: "SetPointer", name: "SetPointer", pkg: "", typ: $funcType([$UnsafePointer], [], false)}, {prop: "SetString", name: "SetString", pkg: "", typ: $funcType([$String], [], false)}, {prop: "String", name: "String", pkg: "", typ: $funcType([], [$String], false)}, {prop: "TryRecv", name: "TryRecv", pkg: "", typ: $funcType([], [Value, $Bool], false)}, {prop: "TrySend", name: "TrySend", pkg: "", typ: $funcType([Value], [$Bool], false)}, {prop: "Type", name: "Type", pkg: "", typ: $funcType([], [Type], false)}, {prop: "Uint", name: "Uint", pkg: "", typ: $funcType([], [$Uint64], false)}, {prop: "UnsafeAddr", name: "UnsafeAddr", pkg: "", typ: $funcType([], [$Uintptr], false)}, {prop: "assignTo", name: "assignTo", pkg: "reflect", typ: $funcType([$String, ptrType$1, $UnsafePointer], [Value], false)}, {prop: "Convert", name: "Convert", pkg: "", typ: $funcType([Type], [Value], false)}];
	flag.methods = [{prop: "kind", name: "kind", pkg: "reflect", typ: $funcType([], [Kind], false)}, {prop: "mustBe", name: "mustBe", pkg: "reflect", typ: $funcType([Kind], [], false)}, {prop: "mustBeExported", name: "mustBeExported", pkg: "reflect", typ: $funcType([], [], false)}, {prop: "mustBeAssignable", name: "mustBeAssignable", pkg: "reflect", typ: $funcType([], [], false)}];
	ptrType$18.methods = [{prop: "Error", name: "Error", pkg: "", typ: $funcType([], [$String], false)}];
	uncommonType.init("reflect", [{prop: "pkgPath", name: "pkgPath", exported: false, typ: nameOff, tag: ""}, {prop: "mcount", name: "mcount", exported: false, typ: $Uint16, tag: ""}, {prop: "_$2", name: "_", exported: false, typ: $Uint16, tag: ""}, {prop: "moff", name: "moff", exported: false, typ: $Uint32, tag: ""}, {prop: "_$4", name: "_", exported: false, typ: $Uint32, tag: ""}, {prop: "_methods", name: "_methods", exported: false, typ: sliceType$3, tag: ""}]);
	funcType.init("reflect", [{prop: "rtype", name: "", exported: false, typ: rtype, tag: "reflect:\"func\""}, {prop: "inCount", name: "inCount", exported: false, typ: $Uint16, tag: ""}, {prop: "outCount", name: "outCount", exported: false, typ: $Uint16, tag: ""}, {prop: "_in", name: "_in", exported: false, typ: sliceType$2, tag: ""}, {prop: "_out", name: "_out", exported: false, typ: sliceType$2, tag: ""}]);
	name.init("reflect", [{prop: "bytes", name: "bytes", exported: false, typ: ptrType$5, tag: ""}]);
	nameData.init("reflect", [{prop: "name", name: "name", exported: false, typ: $String, tag: ""}, {prop: "tag", name: "tag", exported: false, typ: $String, tag: ""}, {prop: "pkgPath", name: "pkgPath", exported: false, typ: $String, tag: ""}, {prop: "exported", name: "exported", exported: false, typ: $Bool, tag: ""}]);
	mapIter.init("reflect", [{prop: "t", name: "t", exported: false, typ: Type, tag: ""}, {prop: "m", name: "m", exported: false, typ: ptrType$3, tag: ""}, {prop: "keys", name: "keys", exported: false, typ: ptrType$3, tag: ""}, {prop: "i", name: "i", exported: false, typ: $Int, tag: ""}]);
	Type.init([{prop: "Align", name: "Align", pkg: "", typ: $funcType([], [$Int], false)}, {prop: "AssignableTo", name: "AssignableTo", pkg: "", typ: $funcType([Type], [$Bool], false)}, {prop: "Bits", name: "Bits", pkg: "", typ: $funcType([], [$Int], false)}, {prop: "ChanDir", name: "ChanDir", pkg: "", typ: $funcType([], [ChanDir], false)}, {prop: "Comparable", name: "Comparable", pkg: "", typ: $funcType([], [$Bool], false)}, {prop: "ConvertibleTo", name: "ConvertibleTo", pkg: "", typ: $funcType([Type], [$Bool], false)}, {prop: "Elem", name: "Elem", pkg: "", typ: $funcType([], [Type], false)}, {prop: "Field", name: "Field", pkg: "", typ: $funcType([$Int], [StructField], false)}, {prop: "FieldAlign", name: "FieldAlign", pkg: "", typ: $funcType([], [$Int], false)}, {prop: "FieldByIndex", name: "FieldByIndex", pkg: "", typ: $funcType([sliceType$14], [StructField], false)}, {prop: "FieldByName", name: "FieldByName", pkg: "", typ: $funcType([$String], [StructField, $Bool], false)}, {prop: "FieldByNameFunc", name: "FieldByNameFunc", pkg: "", typ: $funcType([funcType$3], [StructField, $Bool], false)}, {prop: "Implements", name: "Implements", pkg: "", typ: $funcType([Type], [$Bool], false)}, {prop: "In", name: "In", pkg: "", typ: $funcType([$Int], [Type], false)}, {prop: "IsVariadic", name: "IsVariadic", pkg: "", typ: $funcType([], [$Bool], false)}, {prop: "Key", name: "Key", pkg: "", typ: $funcType([], [Type], false)}, {prop: "Kind", name: "Kind", pkg: "", typ: $funcType([], [Kind], false)}, {prop: "Len", name: "Len", pkg: "", typ: $funcType([], [$Int], false)}, {prop: "Method", name: "Method", pkg: "", typ: $funcType([$Int], [Method], false)}, {prop: "MethodByName", name: "MethodByName", pkg: "", typ: $funcType([$String], [Method, $Bool], false)}, {prop: "Name", name: "Name", pkg: "", typ: $funcType([], [$String], false)}, {prop: "NumField", name: "NumField", pkg: "", typ: $funcType([], [$Int], false)}, {prop: "NumIn", name: "NumIn", pkg: "", typ: $funcType([], [$Int], false)}, {prop: "NumMethod", name: "NumMethod", pkg: "", typ: $funcType([], [$Int], false)}, {prop: "NumOut", name: "NumOut", pkg: "", typ: $funcType([], [$Int], false)}, {prop: "Out", name: "Out", pkg: "", typ: $funcType([$Int], [Type], false)}, {prop: "PkgPath", name: "PkgPath", pkg: "", typ: $funcType([], [$String], false)}, {prop: "Size", name: "Size", pkg: "", typ: $funcType([], [$Uintptr], false)}, {prop: "String", name: "String", pkg: "", typ: $funcType([], [$String], false)}, {prop: "common", name: "common", pkg: "reflect", typ: $funcType([], [ptrType$1], false)}, {prop: "uncommon", name: "uncommon", pkg: "reflect", typ: $funcType([], [ptrType$6], false)}]);
	rtype.init("reflect", [{prop: "size", name: "size", exported: false, typ: $Uintptr, tag: ""}, {prop: "ptrdata", name: "ptrdata", exported: false, typ: $Uintptr, tag: ""}, {prop: "hash", name: "hash", exported: false, typ: $Uint32, tag: ""}, {prop: "tflag", name: "tflag", exported: false, typ: tflag, tag: ""}, {prop: "align", name: "align", exported: false, typ: $Uint8, tag: ""}, {prop: "fieldAlign", name: "fieldAlign", exported: false, typ: $Uint8, tag: ""}, {prop: "kind", name: "kind", exported: false, typ: $Uint8, tag: ""}, {prop: "alg", name: "alg", exported: false, typ: ptrType$4, tag: ""}, {prop: "gcdata", name: "gcdata", exported: false, typ: ptrType$5, tag: ""}, {prop: "str", name: "str", exported: false, typ: nameOff, tag: ""}, {prop: "ptrToThis", name: "ptrToThis", exported: false, typ: typeOff, tag: ""}]);
	typeAlg.init("reflect", [{prop: "hash", name: "hash", exported: false, typ: funcType$4, tag: ""}, {prop: "equal", name: "equal", exported: false, typ: funcType$5, tag: ""}]);
	method.init("reflect", [{prop: "name", name: "name", exported: false, typ: nameOff, tag: ""}, {prop: "mtyp", name: "mtyp", exported: false, typ: typeOff, tag: ""}, {prop: "ifn", name: "ifn", exported: false, typ: textOff, tag: ""}, {prop: "tfn", name: "tfn", exported: false, typ: textOff, tag: ""}]);
	arrayType.init("reflect", [{prop: "rtype", name: "", exported: false, typ: rtype, tag: "reflect:\"array\""}, {prop: "elem", name: "elem", exported: false, typ: ptrType$1, tag: ""}, {prop: "slice", name: "slice", exported: false, typ: ptrType$1, tag: ""}, {prop: "len", name: "len", exported: false, typ: $Uintptr, tag: ""}]);
	chanType.init("reflect", [{prop: "rtype", name: "", exported: false, typ: rtype, tag: "reflect:\"chan\""}, {prop: "elem", name: "elem", exported: false, typ: ptrType$1, tag: ""}, {prop: "dir", name: "dir", exported: false, typ: $Uintptr, tag: ""}]);
	imethod.init("reflect", [{prop: "name", name: "name", exported: false, typ: nameOff, tag: ""}, {prop: "typ", name: "typ", exported: false, typ: typeOff, tag: ""}]);
	interfaceType.init("reflect", [{prop: "rtype", name: "", exported: false, typ: rtype, tag: "reflect:\"interface\""}, {prop: "pkgPath", name: "pkgPath", exported: false, typ: name, tag: ""}, {prop: "methods", name: "methods", exported: false, typ: sliceType$7, tag: ""}]);
	mapType.init("reflect", [{prop: "rtype", name: "", exported: false, typ: rtype, tag: "reflect:\"map\""}, {prop: "key", name: "key", exported: false, typ: ptrType$1, tag: ""}, {prop: "elem", name: "elem", exported: false, typ: ptrType$1, tag: ""}, {prop: "bucket", name: "bucket", exported: false, typ: ptrType$1, tag: ""}, {prop: "hmap", name: "hmap", exported: false, typ: ptrType$1, tag: ""}, {prop: "keysize", name: "keysize", exported: false, typ: $Uint8, tag: ""}, {prop: "indirectkey", name: "indirectkey", exported: false, typ: $Uint8, tag: ""}, {prop: "valuesize", name: "valuesize", exported: false, typ: $Uint8, tag: ""}, {prop: "indirectvalue", name: "indirectvalue", exported: false, typ: $Uint8, tag: ""}, {prop: "bucketsize", name: "bucketsize", exported: false, typ: $Uint16, tag: ""}, {prop: "reflexivekey", name: "reflexivekey", exported: false, typ: $Bool, tag: ""}, {prop: "needkeyupdate", name: "needkeyupdate", exported: false, typ: $Bool, tag: ""}]);
	ptrType.init("reflect", [{prop: "rtype", name: "", exported: false, typ: rtype, tag: "reflect:\"ptr\""}, {prop: "elem", name: "elem", exported: false, typ: ptrType$1, tag: ""}]);
	sliceType.init("reflect", [{prop: "rtype", name: "", exported: false, typ: rtype, tag: "reflect:\"slice\""}, {prop: "elem", name: "elem", exported: false, typ: ptrType$1, tag: ""}]);
	structField.init("reflect", [{prop: "name", name: "name", exported: false, typ: name, tag: ""}, {prop: "typ", name: "typ", exported: false, typ: ptrType$1, tag: ""}, {prop: "offset", name: "offset", exported: false, typ: $Uintptr, tag: ""}]);
	structType.init("reflect", [{prop: "rtype", name: "", exported: false, typ: rtype, tag: "reflect:\"struct\""}, {prop: "pkgPath", name: "pkgPath", exported: false, typ: name, tag: ""}, {prop: "fields", name: "fields", exported: false, typ: sliceType$8, tag: ""}]);
	Method.init("", [{prop: "Name", name: "Name", exported: true, typ: $String, tag: ""}, {prop: "PkgPath", name: "PkgPath", exported: true, typ: $String, tag: ""}, {prop: "Type", name: "Type", exported: true, typ: Type, tag: ""}, {prop: "Func", name: "Func", exported: true, typ: Value, tag: ""}, {prop: "Index", name: "Index", exported: true, typ: $Int, tag: ""}]);
	StructField.init("", [{prop: "Name", name: "Name", exported: true, typ: $String, tag: ""}, {prop: "PkgPath", name: "PkgPath", exported: true, typ: $String, tag: ""}, {prop: "Type", name: "Type", exported: true, typ: Type, tag: ""}, {prop: "Tag", name: "Tag", exported: true, typ: StructTag, tag: ""}, {prop: "Offset", name: "Offset", exported: true, typ: $Uintptr, tag: ""}, {prop: "Index", name: "Index", exported: true, typ: sliceType$14, tag: ""}, {prop: "Anonymous", name: "Anonymous", exported: true, typ: $Bool, tag: ""}]);
	fieldScan.init("reflect", [{prop: "typ", name: "typ", exported: false, typ: ptrType$10, tag: ""}, {prop: "index", name: "index", exported: false, typ: sliceType$14, tag: ""}]);
	Value.init("reflect", [{prop: "typ", name: "typ", exported: false, typ: ptrType$1, tag: ""}, {prop: "ptr", name: "ptr", exported: false, typ: $UnsafePointer, tag: ""}, {prop: "flag", name: "", exported: false, typ: flag, tag: ""}]);
	ValueError.init("", [{prop: "Method", name: "Method", exported: true, typ: $String, tag: ""}, {prop: "Kind", name: "Kind", exported: true, typ: Kind, tag: ""}]);
	$init = function() {
		$pkg.$init = function() {};
		/* */ var $f, $c = false, $s = 0, $r; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		$r = errors.$init(); /* */ $s = 1; case 1: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
		$r = js.$init(); /* */ $s = 2; case 2: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
		$r = math.$init(); /* */ $s = 3; case 3: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
		$r = runtime.$init(); /* */ $s = 4; case 4: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
		$r = strconv.$init(); /* */ $s = 5; case 5: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
		$r = sync.$init(); /* */ $s = 6; case 6: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
		nameOffList = sliceType$1.nil;
		typeOffList = sliceType$2.nil;
		methodCache = new structType$1.ptr(new sync.RWMutex.ptr(new sync.Mutex.ptr(0, 0), 0, 0, 0, 0), false);
		initialized = false;
		uncommonTypeMap = {};
		nameMap = {};
		callHelper = $assertType($internalize($call, $emptyInterface), funcType$1);
		selectHelper = $assertType($internalize($select, $emptyInterface), funcType$1);
		jsObjectPtr = reflectType($jsObjectPtr);
		kindNames = new sliceType$6(["invalid", "bool", "int", "int8", "int16", "int32", "int64", "uint", "uint8", "uint16", "uint32", "uint64", "uintptr", "float32", "float64", "complex64", "complex128", "array", "chan", "func", "interface", "map", "ptr", "slice", "string", "struct", "unsafe.Pointer"]);
		uint8Type = $assertType(TypeOf(new $Uint8(0)), ptrType$1);
		$r = init(); /* */ $s = 7; case 7: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
		/* */ } return; } if ($f === undefined) { $f = { $blk: $init }; } $f.$s = $s; $f.$r = $r; return $f;
	};
	$pkg.$init = $init;
	return $pkg;
})();
$packages["io"] = (function() {
	var $pkg = {}, $init, errors, sync, errWhence, errOffset;
	errors = $packages["errors"];
	sync = $packages["sync"];
	$init = function() {
		$pkg.$init = function() {};
		/* */ var $f, $c = false, $s = 0, $r; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		$r = errors.$init(); /* */ $s = 1; case 1: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
		$r = sync.$init(); /* */ $s = 2; case 2: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
		$pkg.ErrShortWrite = errors.New("short write");
		$pkg.ErrShortBuffer = errors.New("short buffer");
		$pkg.EOF = errors.New("EOF");
		$pkg.ErrUnexpectedEOF = errors.New("unexpected EOF");
		$pkg.ErrNoProgress = errors.New("multiple Read calls return no data or error");
		errWhence = errors.New("Seek: invalid whence");
		errOffset = errors.New("Seek: invalid offset");
		$pkg.ErrClosedPipe = errors.New("io: read/write on closed pipe");
		/* */ } return; } if ($f === undefined) { $f = { $blk: $init }; } $f.$s = $s; $f.$r = $r; return $f;
	};
	$pkg.$init = $init;
	return $pkg;
})();
$packages["unicode"] = (function() {
	var $pkg = {}, $init, CaseRange, d, arrayType, sliceType$3, _CaseRanges, to, To, ToUpper;
	CaseRange = $pkg.CaseRange = $newType(0, $kindStruct, "unicode.CaseRange", true, "unicode", true, function(Lo_, Hi_, Delta_) {
		this.$val = this;
		if (arguments.length === 0) {
			this.Lo = 0;
			this.Hi = 0;
			this.Delta = arrayType.zero();
			return;
		}
		this.Lo = Lo_;
		this.Hi = Hi_;
		this.Delta = Delta_;
	});
	d = $pkg.d = $newType(12, $kindArray, "unicode.d", true, "unicode", false, null);
	arrayType = $arrayType($Int32, 3);
	sliceType$3 = $sliceType(CaseRange);
	to = function(_case, r, caseRange) {
		var $ptr, _case, _q, caseRange, cr, delta, hi, lo, m, r, x;
		if (_case < 0 || 3 <= _case) {
			return 65533;
		}
		lo = 0;
		hi = caseRange.$length;
		while (true) {
			if (!(lo < hi)) { break; }
			m = lo + (_q = ((hi - lo >> 0)) / 2, (_q === _q && _q !== 1/0 && _q !== -1/0) ? _q >> 0 : $throwRuntimeError("integer divide by zero")) >> 0;
			cr = ((m < 0 || m >= caseRange.$length) ? ($throwRuntimeError("index out of range"), undefined) : caseRange.$array[caseRange.$offset + m]);
			if (((cr.Lo >> 0)) <= r && r <= ((cr.Hi >> 0))) {
				delta = ((x = cr.Delta, ((_case < 0 || _case >= x.length) ? ($throwRuntimeError("index out of range"), undefined) : x[_case])));
				if (delta > 1114111) {
					return ((cr.Lo >> 0)) + ((((((r - ((cr.Lo >> 0)) >> 0)) & ~1) >> 0) | (((_case & 1) >> 0)))) >> 0;
				}
				return r + delta >> 0;
			}
			if (r < ((cr.Lo >> 0))) {
				hi = m;
			} else {
				lo = m + 1 >> 0;
			}
		}
		return r;
	};
	To = function(_case, r) {
		var $ptr, _case, r;
		return to(_case, r, $pkg.CaseRanges);
	};
	$pkg.To = To;
	ToUpper = function(r) {
		var $ptr, r;
		if (r <= 127) {
			if (97 <= r && r <= 122) {
				r = r - (32) >> 0;
			}
			return r;
		}
		return To(0, r);
	};
	$pkg.ToUpper = ToUpper;
	CaseRange.init("", [{prop: "Lo", name: "Lo", exported: true, typ: $Uint32, tag: ""}, {prop: "Hi", name: "Hi", exported: true, typ: $Uint32, tag: ""}, {prop: "Delta", name: "Delta", exported: true, typ: d, tag: ""}]);
	d.init($Int32, 3);
	$init = function() {
		$pkg.$init = function() {};
		/* */ var $f, $c = false, $s = 0, $r; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		_CaseRanges = new sliceType$3([new CaseRange.ptr(65, 90, $toNativeArray($kindInt32, [0, 32, 0])), new CaseRange.ptr(97, 122, $toNativeArray($kindInt32, [-32, 0, -32])), new CaseRange.ptr(181, 181, $toNativeArray($kindInt32, [743, 0, 743])), new CaseRange.ptr(192, 214, $toNativeArray($kindInt32, [0, 32, 0])), new CaseRange.ptr(216, 222, $toNativeArray($kindInt32, [0, 32, 0])), new CaseRange.ptr(224, 246, $toNativeArray($kindInt32, [-32, 0, -32])), new CaseRange.ptr(248, 254, $toNativeArray($kindInt32, [-32, 0, -32])), new CaseRange.ptr(255, 255, $toNativeArray($kindInt32, [121, 0, 121])), new CaseRange.ptr(256, 303, $toNativeArray($kindInt32, [1114112, 1114112, 1114112])), new CaseRange.ptr(304, 304, $toNativeArray($kindInt32, [0, -199, 0])), new CaseRange.ptr(305, 305, $toNativeArray($kindInt32, [-232, 0, -232])), new CaseRange.ptr(306, 311, $toNativeArray($kindInt32, [1114112, 1114112, 1114112])), new CaseRange.ptr(313, 328, $toNativeArray($kindInt32, [1114112, 1114112, 1114112])), new CaseRange.ptr(330, 375, $toNativeArray($kindInt32, [1114112, 1114112, 1114112])), new CaseRange.ptr(376, 376, $toNativeArray($kindInt32, [0, -121, 0])), new CaseRange.ptr(377, 382, $toNativeArray($kindInt32, [1114112, 1114112, 1114112])), new CaseRange.ptr(383, 383, $toNativeArray($kindInt32, [-300, 0, -300])), new CaseRange.ptr(384, 384, $toNativeArray($kindInt32, [195, 0, 195])), new CaseRange.ptr(385, 385, $toNativeArray($kindInt32, [0, 210, 0])), new CaseRange.ptr(386, 389, $toNativeArray($kindInt32, [1114112, 1114112, 1114112])), new CaseRange.ptr(390, 390, $toNativeArray($kindInt32, [0, 206, 0])), new CaseRange.ptr(391, 392, $toNativeArray($kindInt32, [1114112, 1114112, 1114112])), new CaseRange.ptr(393, 394, $toNativeArray($kindInt32, [0, 205, 0])), new CaseRange.ptr(395, 396, $toNativeArray($kindInt32, [1114112, 1114112, 1114112])), new CaseRange.ptr(398, 398, $toNativeArray($kindInt32, [0, 79, 0])), new CaseRange.ptr(399, 399, $toNativeArray($kindInt32, [0, 202, 0])), new CaseRange.ptr(400, 400, $toNativeArray($kindInt32, [0, 203, 0])), new CaseRange.ptr(401, 402, $toNativeArray($kindInt32, [1114112, 1114112, 1114112])), new CaseRange.ptr(403, 403, $toNativeArray($kindInt32, [0, 205, 0])), new CaseRange.ptr(404, 404, $toNativeArray($kindInt32, [0, 207, 0])), new CaseRange.ptr(405, 405, $toNativeArray($kindInt32, [97, 0, 97])), new CaseRange.ptr(406, 406, $toNativeArray($kindInt32, [0, 211, 0])), new CaseRange.ptr(407, 407, $toNativeArray($kindInt32, [0, 209, 0])), new CaseRange.ptr(408, 409, $toNativeArray($kindInt32, [1114112, 1114112, 1114112])), new CaseRange.ptr(410, 410, $toNativeArray($kindInt32, [163, 0, 163])), new CaseRange.ptr(412, 412, $toNativeArray($kindInt32, [0, 211, 0])), new CaseRange.ptr(413, 413, $toNativeArray($kindInt32, [0, 213, 0])), new CaseRange.ptr(414, 414, $toNativeArray($kindInt32, [130, 0, 130])), new CaseRange.ptr(415, 415, $toNativeArray($kindInt32, [0, 214, 0])), new CaseRange.ptr(416, 421, $toNativeArray($kindInt32, [1114112, 1114112, 1114112])), new CaseRange.ptr(422, 422, $toNativeArray($kindInt32, [0, 218, 0])), new CaseRange.ptr(423, 424, $toNativeArray($kindInt32, [1114112, 1114112, 1114112])), new CaseRange.ptr(425, 425, $toNativeArray($kindInt32, [0, 218, 0])), new CaseRange.ptr(428, 429, $toNativeArray($kindInt32, [1114112, 1114112, 1114112])), new CaseRange.ptr(430, 430, $toNativeArray($kindInt32, [0, 218, 0])), new CaseRange.ptr(431, 432, $toNativeArray($kindInt32, [1114112, 1114112, 1114112])), new CaseRange.ptr(433, 434, $toNativeArray($kindInt32, [0, 217, 0])), new CaseRange.ptr(435, 438, $toNativeArray($kindInt32, [1114112, 1114112, 1114112])), new CaseRange.ptr(439, 439, $toNativeArray($kindInt32, [0, 219, 0])), new CaseRange.ptr(440, 441, $toNativeArray($kindInt32, [1114112, 1114112, 1114112])), new CaseRange.ptr(444, 445, $toNativeArray($kindInt32, [1114112, 1114112, 1114112])), new CaseRange.ptr(447, 447, $toNativeArray($kindInt32, [56, 0, 56])), new CaseRange.ptr(452, 452, $toNativeArray($kindInt32, [0, 2, 1])), new CaseRange.ptr(453, 453, $toNativeArray($kindInt32, [-1, 1, 0])), new CaseRange.ptr(454, 454, $toNativeArray($kindInt32, [-2, 0, -1])), new CaseRange.ptr(455, 455, $toNativeArray($kindInt32, [0, 2, 1])), new CaseRange.ptr(456, 456, $toNativeArray($kindInt32, [-1, 1, 0])), new CaseRange.ptr(457, 457, $toNativeArray($kindInt32, [-2, 0, -1])), new CaseRange.ptr(458, 458, $toNativeArray($kindInt32, [0, 2, 1])), new CaseRange.ptr(459, 459, $toNativeArray($kindInt32, [-1, 1, 0])), new CaseRange.ptr(460, 460, $toNativeArray($kindInt32, [-2, 0, -1])), new CaseRange.ptr(461, 476, $toNativeArray($kindInt32, [1114112, 1114112, 1114112])), new CaseRange.ptr(477, 477, $toNativeArray($kindInt32, [-79, 0, -79])), new CaseRange.ptr(478, 495, $toNativeArray($kindInt32, [1114112, 1114112, 1114112])), new CaseRange.ptr(497, 497, $toNativeArray($kindInt32, [0, 2, 1])), new CaseRange.ptr(498, 498, $toNativeArray($kindInt32, [-1, 1, 0])), new CaseRange.ptr(499, 499, $toNativeArray($kindInt32, [-2, 0, -1])), new CaseRange.ptr(500, 501, $toNativeArray($kindInt32, [1114112, 1114112, 1114112])), new CaseRange.ptr(502, 502, $toNativeArray($kindInt32, [0, -97, 0])), new CaseRange.ptr(503, 503, $toNativeArray($kindInt32, [0, -56, 0])), new CaseRange.ptr(504, 543, $toNativeArray($kindInt32, [1114112, 1114112, 1114112])), new CaseRange.ptr(544, 544, $toNativeArray($kindInt32, [0, -130, 0])), new CaseRange.ptr(546, 563, $toNativeArray($kindInt32, [1114112, 1114112, 1114112])), new CaseRange.ptr(570, 570, $toNativeArray($kindInt32, [0, 10795, 0])), new CaseRange.ptr(571, 572, $toNativeArray($kindInt32, [1114112, 1114112, 1114112])), new CaseRange.ptr(573, 573, $toNativeArray($kindInt32, [0, -163, 0])), new CaseRange.ptr(574, 574, $toNativeArray($kindInt32, [0, 10792, 0])), new CaseRange.ptr(575, 576, $toNativeArray($kindInt32, [10815, 0, 10815])), new CaseRange.ptr(577, 578, $toNativeArray($kindInt32, [1114112, 1114112, 1114112])), new CaseRange.ptr(579, 579, $toNativeArray($kindInt32, [0, -195, 0])), new CaseRange.ptr(580, 580, $toNativeArray($kindInt32, [0, 69, 0])), new CaseRange.ptr(581, 581, $toNativeArray($kindInt32, [0, 71, 0])), new CaseRange.ptr(582, 591, $toNativeArray($kindInt32, [1114112, 1114112, 1114112])), new CaseRange.ptr(592, 592, $toNativeArray($kindInt32, [10783, 0, 10783])), new CaseRange.ptr(593, 593, $toNativeArray($kindInt32, [10780, 0, 10780])), new CaseRange.ptr(594, 594, $toNativeArray($kindInt32, [10782, 0, 10782])), new CaseRange.ptr(595, 595, $toNativeArray($kindInt32, [-210, 0, -210])), new CaseRange.ptr(596, 596, $toNativeArray($kindInt32, [-206, 0, -206])), new CaseRange.ptr(598, 599, $toNativeArray($kindInt32, [-205, 0, -205])), new CaseRange.ptr(601, 601, $toNativeArray($kindInt32, [-202, 0, -202])), new CaseRange.ptr(603, 603, $toNativeArray($kindInt32, [-203, 0, -203])), new CaseRange.ptr(604, 604, $toNativeArray($kindInt32, [42319, 0, 42319])), new CaseRange.ptr(608, 608, $toNativeArray($kindInt32, [-205, 0, -205])), new CaseRange.ptr(609, 609, $toNativeArray($kindInt32, [42315, 0, 42315])), new CaseRange.ptr(611, 611, $toNativeArray($kindInt32, [-207, 0, -207])), new CaseRange.ptr(613, 613, $toNativeArray($kindInt32, [42280, 0, 42280])), new CaseRange.ptr(614, 614, $toNativeArray($kindInt32, [42308, 0, 42308])), new CaseRange.ptr(616, 616, $toNativeArray($kindInt32, [-209, 0, -209])), new CaseRange.ptr(617, 617, $toNativeArray($kindInt32, [-211, 0, -211])), new CaseRange.ptr(618, 618, $toNativeArray($kindInt32, [42308, 0, 42308])), new CaseRange.ptr(619, 619, $toNativeArray($kindInt32, [10743, 0, 10743])), new CaseRange.ptr(620, 620, $toNativeArray($kindInt32, [42305, 0, 42305])), new CaseRange.ptr(623, 623, $toNativeArray($kindInt32, [-211, 0, -211])), new CaseRange.ptr(625, 625, $toNativeArray($kindInt32, [10749, 0, 10749])), new CaseRange.ptr(626, 626, $toNativeArray($kindInt32, [-213, 0, -213])), new CaseRange.ptr(629, 629, $toNativeArray($kindInt32, [-214, 0, -214])), new CaseRange.ptr(637, 637, $toNativeArray($kindInt32, [10727, 0, 10727])), new CaseRange.ptr(640, 640, $toNativeArray($kindInt32, [-218, 0, -218])), new CaseRange.ptr(643, 643, $toNativeArray($kindInt32, [-218, 0, -218])), new CaseRange.ptr(647, 647, $toNativeArray($kindInt32, [42282, 0, 42282])), new CaseRange.ptr(648, 648, $toNativeArray($kindInt32, [-218, 0, -218])), new CaseRange.ptr(649, 649, $toNativeArray($kindInt32, [-69, 0, -69])), new CaseRange.ptr(650, 651, $toNativeArray($kindInt32, [-217, 0, -217])), new CaseRange.ptr(652, 652, $toNativeArray($kindInt32, [-71, 0, -71])), new CaseRange.ptr(658, 658, $toNativeArray($kindInt32, [-219, 0, -219])), new CaseRange.ptr(669, 669, $toNativeArray($kindInt32, [42261, 0, 42261])), new CaseRange.ptr(670, 670, $toNativeArray($kindInt32, [42258, 0, 42258])), new CaseRange.ptr(837, 837, $toNativeArray($kindInt32, [84, 0, 84])), new CaseRange.ptr(880, 883, $toNativeArray($kindInt32, [1114112, 1114112, 1114112])), new CaseRange.ptr(886, 887, $toNativeArray($kindInt32, [1114112, 1114112, 1114112])), new CaseRange.ptr(891, 893, $toNativeArray($kindInt32, [130, 0, 130])), new CaseRange.ptr(895, 895, $toNativeArray($kindInt32, [0, 116, 0])), new CaseRange.ptr(902, 902, $toNativeArray($kindInt32, [0, 38, 0])), new CaseRange.ptr(904, 906, $toNativeArray($kindInt32, [0, 37, 0])), new CaseRange.ptr(908, 908, $toNativeArray($kindInt32, [0, 64, 0])), new CaseRange.ptr(910, 911, $toNativeArray($kindInt32, [0, 63, 0])), new CaseRange.ptr(913, 929, $toNativeArray($kindInt32, [0, 32, 0])), new CaseRange.ptr(931, 939, $toNativeArray($kindInt32, [0, 32, 0])), new CaseRange.ptr(940, 940, $toNativeArray($kindInt32, [-38, 0, -38])), new CaseRange.ptr(941, 943, $toNativeArray($kindInt32, [-37, 0, -37])), new CaseRange.ptr(945, 961, $toNativeArray($kindInt32, [-32, 0, -32])), new CaseRange.ptr(962, 962, $toNativeArray($kindInt32, [-31, 0, -31])), new CaseRange.ptr(963, 971, $toNativeArray($kindInt32, [-32, 0, -32])), new CaseRange.ptr(972, 972, $toNativeArray($kindInt32, [-64, 0, -64])), new CaseRange.ptr(973, 974, $toNativeArray($kindInt32, [-63, 0, -63])), new CaseRange.ptr(975, 975, $toNativeArray($kindInt32, [0, 8, 0])), new CaseRange.ptr(976, 976, $toNativeArray($kindInt32, [-62, 0, -62])), new CaseRange.ptr(977, 977, $toNativeArray($kindInt32, [-57, 0, -57])), new CaseRange.ptr(981, 981, $toNativeArray($kindInt32, [-47, 0, -47])), new CaseRange.ptr(982, 982, $toNativeArray($kindInt32, [-54, 0, -54])), new CaseRange.ptr(983, 983, $toNativeArray($kindInt32, [-8, 0, -8])), new CaseRange.ptr(984, 1007, $toNativeArray($kindInt32, [1114112, 1114112, 1114112])), new CaseRange.ptr(1008, 1008, $toNativeArray($kindInt32, [-86, 0, -86])), new CaseRange.ptr(1009, 1009, $toNativeArray($kindInt32, [-80, 0, -80])), new CaseRange.ptr(1010, 1010, $toNativeArray($kindInt32, [7, 0, 7])), new CaseRange.ptr(1011, 1011, $toNativeArray($kindInt32, [-116, 0, -116])), new CaseRange.ptr(1012, 1012, $toNativeArray($kindInt32, [0, -60, 0])), new CaseRange.ptr(1013, 1013, $toNativeArray($kindInt32, [-96, 0, -96])), new CaseRange.ptr(1015, 1016, $toNativeArray($kindInt32, [1114112, 1114112, 1114112])), new CaseRange.ptr(1017, 1017, $toNativeArray($kindInt32, [0, -7, 0])), new CaseRange.ptr(1018, 1019, $toNativeArray($kindInt32, [1114112, 1114112, 1114112])), new CaseRange.ptr(1021, 1023, $toNativeArray($kindInt32, [0, -130, 0])), new CaseRange.ptr(1024, 1039, $toNativeArray($kindInt32, [0, 80, 0])), new CaseRange.ptr(1040, 1071, $toNativeArray($kindInt32, [0, 32, 0])), new CaseRange.ptr(1072, 1103, $toNativeArray($kindInt32, [-32, 0, -32])), new CaseRange.ptr(1104, 1119, $toNativeArray($kindInt32, [-80, 0, -80])), new CaseRange.ptr(1120, 1153, $toNativeArray($kindInt32, [1114112, 1114112, 1114112])), new CaseRange.ptr(1162, 1215, $toNativeArray($kindInt32, [1114112, 1114112, 1114112])), new CaseRange.ptr(1216, 1216, $toNativeArray($kindInt32, [0, 15, 0])), new CaseRange.ptr(1217, 1230, $toNativeArray($kindInt32, [1114112, 1114112, 1114112])), new CaseRange.ptr(1231, 1231, $toNativeArray($kindInt32, [-15, 0, -15])), new CaseRange.ptr(1232, 1327, $toNativeArray($kindInt32, [1114112, 1114112, 1114112])), new CaseRange.ptr(1329, 1366, $toNativeArray($kindInt32, [0, 48, 0])), new CaseRange.ptr(1377, 1414, $toNativeArray($kindInt32, [-48, 0, -48])), new CaseRange.ptr(4256, 4293, $toNativeArray($kindInt32, [0, 7264, 0])), new CaseRange.ptr(4295, 4295, $toNativeArray($kindInt32, [0, 7264, 0])), new CaseRange.ptr(4301, 4301, $toNativeArray($kindInt32, [0, 7264, 0])), new CaseRange.ptr(5024, 5103, $toNativeArray($kindInt32, [0, 38864, 0])), new CaseRange.ptr(5104, 5109, $toNativeArray($kindInt32, [0, 8, 0])), new CaseRange.ptr(5112, 5117, $toNativeArray($kindInt32, [-8, 0, -8])), new CaseRange.ptr(7296, 7296, $toNativeArray($kindInt32, [-6254, 0, -6254])), new CaseRange.ptr(7297, 7297, $toNativeArray($kindInt32, [-6253, 0, -6253])), new CaseRange.ptr(7298, 7298, $toNativeArray($kindInt32, [-6244, 0, -6244])), new CaseRange.ptr(7299, 7300, $toNativeArray($kindInt32, [-6242, 0, -6242])), new CaseRange.ptr(7301, 7301, $toNativeArray($kindInt32, [-6243, 0, -6243])), new CaseRange.ptr(7302, 7302, $toNativeArray($kindInt32, [-6236, 0, -6236])), new CaseRange.ptr(7303, 7303, $toNativeArray($kindInt32, [-6181, 0, -6181])), new CaseRange.ptr(7304, 7304, $toNativeArray($kindInt32, [35266, 0, 35266])), new CaseRange.ptr(7545, 7545, $toNativeArray($kindInt32, [35332, 0, 35332])), new CaseRange.ptr(7549, 7549, $toNativeArray($kindInt32, [3814, 0, 3814])), new CaseRange.ptr(7680, 7829, $toNativeArray($kindInt32, [1114112, 1114112, 1114112])), new CaseRange.ptr(7835, 7835, $toNativeArray($kindInt32, [-59, 0, -59])), new CaseRange.ptr(7838, 7838, $toNativeArray($kindInt32, [0, -7615, 0])), new CaseRange.ptr(7840, 7935, $toNativeArray($kindInt32, [1114112, 1114112, 1114112])), new CaseRange.ptr(7936, 7943, $toNativeArray($kindInt32, [8, 0, 8])), new CaseRange.ptr(7944, 7951, $toNativeArray($kindInt32, [0, -8, 0])), new CaseRange.ptr(7952, 7957, $toNativeArray($kindInt32, [8, 0, 8])), new CaseRange.ptr(7960, 7965, $toNativeArray($kindInt32, [0, -8, 0])), new CaseRange.ptr(7968, 7975, $toNativeArray($kindInt32, [8, 0, 8])), new CaseRange.ptr(7976, 7983, $toNativeArray($kindInt32, [0, -8, 0])), new CaseRange.ptr(7984, 7991, $toNativeArray($kindInt32, [8, 0, 8])), new CaseRange.ptr(7992, 7999, $toNativeArray($kindInt32, [0, -8, 0])), new CaseRange.ptr(8000, 8005, $toNativeArray($kindInt32, [8, 0, 8])), new CaseRange.ptr(8008, 8013, $toNativeArray($kindInt32, [0, -8, 0])), new CaseRange.ptr(8017, 8017, $toNativeArray($kindInt32, [8, 0, 8])), new CaseRange.ptr(8019, 8019, $toNativeArray($kindInt32, [8, 0, 8])), new CaseRange.ptr(8021, 8021, $toNativeArray($kindInt32, [8, 0, 8])), new CaseRange.ptr(8023, 8023, $toNativeArray($kindInt32, [8, 0, 8])), new CaseRange.ptr(8025, 8025, $toNativeArray($kindInt32, [0, -8, 0])), new CaseRange.ptr(8027, 8027, $toNativeArray($kindInt32, [0, -8, 0])), new CaseRange.ptr(8029, 8029, $toNativeArray($kindInt32, [0, -8, 0])), new CaseRange.ptr(8031, 8031, $toNativeArray($kindInt32, [0, -8, 0])), new CaseRange.ptr(8032, 8039, $toNativeArray($kindInt32, [8, 0, 8])), new CaseRange.ptr(8040, 8047, $toNativeArray($kindInt32, [0, -8, 0])), new CaseRange.ptr(8048, 8049, $toNativeArray($kindInt32, [74, 0, 74])), new CaseRange.ptr(8050, 8053, $toNativeArray($kindInt32, [86, 0, 86])), new CaseRange.ptr(8054, 8055, $toNativeArray($kindInt32, [100, 0, 100])), new CaseRange.ptr(8056, 8057, $toNativeArray($kindInt32, [128, 0, 128])), new CaseRange.ptr(8058, 8059, $toNativeArray($kindInt32, [112, 0, 112])), new CaseRange.ptr(8060, 8061, $toNativeArray($kindInt32, [126, 0, 126])), new CaseRange.ptr(8064, 8071, $toNativeArray($kindInt32, [8, 0, 8])), new CaseRange.ptr(8072, 8079, $toNativeArray($kindInt32, [0, -8, 0])), new CaseRange.ptr(8080, 8087, $toNativeArray($kindInt32, [8, 0, 8])), new CaseRange.ptr(8088, 8095, $toNativeArray($kindInt32, [0, -8, 0])), new CaseRange.ptr(8096, 8103, $toNativeArray($kindInt32, [8, 0, 8])), new CaseRange.ptr(8104, 8111, $toNativeArray($kindInt32, [0, -8, 0])), new CaseRange.ptr(8112, 8113, $toNativeArray($kindInt32, [8, 0, 8])), new CaseRange.ptr(8115, 8115, $toNativeArray($kindInt32, [9, 0, 9])), new CaseRange.ptr(8120, 8121, $toNativeArray($kindInt32, [0, -8, 0])), new CaseRange.ptr(8122, 8123, $toNativeArray($kindInt32, [0, -74, 0])), new CaseRange.ptr(8124, 8124, $toNativeArray($kindInt32, [0, -9, 0])), new CaseRange.ptr(8126, 8126, $toNativeArray($kindInt32, [-7205, 0, -7205])), new CaseRange.ptr(8131, 8131, $toNativeArray($kindInt32, [9, 0, 9])), new CaseRange.ptr(8136, 8139, $toNativeArray($kindInt32, [0, -86, 0])), new CaseRange.ptr(8140, 8140, $toNativeArray($kindInt32, [0, -9, 0])), new CaseRange.ptr(8144, 8145, $toNativeArray($kindInt32, [8, 0, 8])), new CaseRange.ptr(8152, 8153, $toNativeArray($kindInt32, [0, -8, 0])), new CaseRange.ptr(8154, 8155, $toNativeArray($kindInt32, [0, -100, 0])), new CaseRange.ptr(8160, 8161, $toNativeArray($kindInt32, [8, 0, 8])), new CaseRange.ptr(8165, 8165, $toNativeArray($kindInt32, [7, 0, 7])), new CaseRange.ptr(8168, 8169, $toNativeArray($kindInt32, [0, -8, 0])), new CaseRange.ptr(8170, 8171, $toNativeArray($kindInt32, [0, -112, 0])), new CaseRange.ptr(8172, 8172, $toNativeArray($kindInt32, [0, -7, 0])), new CaseRange.ptr(8179, 8179, $toNativeArray($kindInt32, [9, 0, 9])), new CaseRange.ptr(8184, 8185, $toNativeArray($kindInt32, [0, -128, 0])), new CaseRange.ptr(8186, 8187, $toNativeArray($kindInt32, [0, -126, 0])), new CaseRange.ptr(8188, 8188, $toNativeArray($kindInt32, [0, -9, 0])), new CaseRange.ptr(8486, 8486, $toNativeArray($kindInt32, [0, -7517, 0])), new CaseRange.ptr(8490, 8490, $toNativeArray($kindInt32, [0, -8383, 0])), new CaseRange.ptr(8491, 8491, $toNativeArray($kindInt32, [0, -8262, 0])), new CaseRange.ptr(8498, 8498, $toNativeArray($kindInt32, [0, 28, 0])), new CaseRange.ptr(8526, 8526, $toNativeArray($kindInt32, [-28, 0, -28])), new CaseRange.ptr(8544, 8559, $toNativeArray($kindInt32, [0, 16, 0])), new CaseRange.ptr(8560, 8575, $toNativeArray($kindInt32, [-16, 0, -16])), new CaseRange.ptr(8579, 8580, $toNativeArray($kindInt32, [1114112, 1114112, 1114112])), new CaseRange.ptr(9398, 9423, $toNativeArray($kindInt32, [0, 26, 0])), new CaseRange.ptr(9424, 9449, $toNativeArray($kindInt32, [-26, 0, -26])), new CaseRange.ptr(11264, 11310, $toNativeArray($kindInt32, [0, 48, 0])), new CaseRange.ptr(11312, 11358, $toNativeArray($kindInt32, [-48, 0, -48])), new CaseRange.ptr(11360, 11361, $toNativeArray($kindInt32, [1114112, 1114112, 1114112])), new CaseRange.ptr(11362, 11362, $toNativeArray($kindInt32, [0, -10743, 0])), new CaseRange.ptr(11363, 11363, $toNativeArray($kindInt32, [0, -3814, 0])), new CaseRange.ptr(11364, 11364, $toNativeArray($kindInt32, [0, -10727, 0])), new CaseRange.ptr(11365, 11365, $toNativeArray($kindInt32, [-10795, 0, -10795])), new CaseRange.ptr(11366, 11366, $toNativeArray($kindInt32, [-10792, 0, -10792])), new CaseRange.ptr(11367, 11372, $toNativeArray($kindInt32, [1114112, 1114112, 1114112])), new CaseRange.ptr(11373, 11373, $toNativeArray($kindInt32, [0, -10780, 0])), new CaseRange.ptr(11374, 11374, $toNativeArray($kindInt32, [0, -10749, 0])), new CaseRange.ptr(11375, 11375, $toNativeArray($kindInt32, [0, -10783, 0])), new CaseRange.ptr(11376, 11376, $toNativeArray($kindInt32, [0, -10782, 0])), new CaseRange.ptr(11378, 11379, $toNativeArray($kindInt32, [1114112, 1114112, 1114112])), new CaseRange.ptr(11381, 11382, $toNativeArray($kindInt32, [1114112, 1114112, 1114112])), new CaseRange.ptr(11390, 11391, $toNativeArray($kindInt32, [0, -10815, 0])), new CaseRange.ptr(11392, 11491, $toNativeArray($kindInt32, [1114112, 1114112, 1114112])), new CaseRange.ptr(11499, 11502, $toNativeArray($kindInt32, [1114112, 1114112, 1114112])), new CaseRange.ptr(11506, 11507, $toNativeArray($kindInt32, [1114112, 1114112, 1114112])), new CaseRange.ptr(11520, 11557, $toNativeArray($kindInt32, [-7264, 0, -7264])), new CaseRange.ptr(11559, 11559, $toNativeArray($kindInt32, [-7264, 0, -7264])), new CaseRange.ptr(11565, 11565, $toNativeArray($kindInt32, [-7264, 0, -7264])), new CaseRange.ptr(42560, 42605, $toNativeArray($kindInt32, [1114112, 1114112, 1114112])), new CaseRange.ptr(42624, 42651, $toNativeArray($kindInt32, [1114112, 1114112, 1114112])), new CaseRange.ptr(42786, 42799, $toNativeArray($kindInt32, [1114112, 1114112, 1114112])), new CaseRange.ptr(42802, 42863, $toNativeArray($kindInt32, [1114112, 1114112, 1114112])), new CaseRange.ptr(42873, 42876, $toNativeArray($kindInt32, [1114112, 1114112, 1114112])), new CaseRange.ptr(42877, 42877, $toNativeArray($kindInt32, [0, -35332, 0])), new CaseRange.ptr(42878, 42887, $toNativeArray($kindInt32, [1114112, 1114112, 1114112])), new CaseRange.ptr(42891, 42892, $toNativeArray($kindInt32, [1114112, 1114112, 1114112])), new CaseRange.ptr(42893, 42893, $toNativeArray($kindInt32, [0, -42280, 0])), new CaseRange.ptr(42896, 42899, $toNativeArray($kindInt32, [1114112, 1114112, 1114112])), new CaseRange.ptr(42902, 42921, $toNativeArray($kindInt32, [1114112, 1114112, 1114112])), new CaseRange.ptr(42922, 42922, $toNativeArray($kindInt32, [0, -42308, 0])), new CaseRange.ptr(42923, 42923, $toNativeArray($kindInt32, [0, -42319, 0])), new CaseRange.ptr(42924, 42924, $toNativeArray($kindInt32, [0, -42315, 0])), new CaseRange.ptr(42925, 42925, $toNativeArray($kindInt32, [0, -42305, 0])), new CaseRange.ptr(42926, 42926, $toNativeArray($kindInt32, [0, -42308, 0])), new CaseRange.ptr(42928, 42928, $toNativeArray($kindInt32, [0, -42258, 0])), new CaseRange.ptr(42929, 42929, $toNativeArray($kindInt32, [0, -42282, 0])), new CaseRange.ptr(42930, 42930, $toNativeArray($kindInt32, [0, -42261, 0])), new CaseRange.ptr(42931, 42931, $toNativeArray($kindInt32, [0, 928, 0])), new CaseRange.ptr(42932, 42935, $toNativeArray($kindInt32, [1114112, 1114112, 1114112])), new CaseRange.ptr(43859, 43859, $toNativeArray($kindInt32, [-928, 0, -928])), new CaseRange.ptr(43888, 43967, $toNativeArray($kindInt32, [-38864, 0, -38864])), new CaseRange.ptr(65313, 65338, $toNativeArray($kindInt32, [0, 32, 0])), new CaseRange.ptr(65345, 65370, $toNativeArray($kindInt32, [-32, 0, -32])), new CaseRange.ptr(66560, 66599, $toNativeArray($kindInt32, [0, 40, 0])), new CaseRange.ptr(66600, 66639, $toNativeArray($kindInt32, [-40, 0, -40])), new CaseRange.ptr(66736, 66771, $toNativeArray($kindInt32, [0, 40, 0])), new CaseRange.ptr(66776, 66811, $toNativeArray($kindInt32, [-40, 0, -40])), new CaseRange.ptr(68736, 68786, $toNativeArray($kindInt32, [0, 64, 0])), new CaseRange.ptr(68800, 68850, $toNativeArray($kindInt32, [-64, 0, -64])), new CaseRange.ptr(71840, 71871, $toNativeArray($kindInt32, [0, 32, 0])), new CaseRange.ptr(71872, 71903, $toNativeArray($kindInt32, [-32, 0, -32])), new CaseRange.ptr(125184, 125217, $toNativeArray($kindInt32, [0, 34, 0])), new CaseRange.ptr(125218, 125251, $toNativeArray($kindInt32, [-34, 0, -34]))]);
		$pkg.CaseRanges = _CaseRanges;
		/* */ } return; } if ($f === undefined) { $f = { $blk: $init }; } $f.$s = $s; $f.$r = $r; return $f;
	};
	$pkg.$init = $init;
	return $pkg;
})();
$packages["strings"] = (function() {
	var $pkg = {}, $init, errors, js, io, unicode, utf8, sliceType, Map, ToUpper;
	errors = $packages["errors"];
	js = $packages["github.com/gopherjs/gopherjs/js"];
	io = $packages["io"];
	unicode = $packages["unicode"];
	utf8 = $packages["unicode/utf8"];
	sliceType = $sliceType($Uint8);
	Map = function(mapping, s) {
		var $ptr, _i, _r, _ref, _rune, b, c, i, mapping, maxbytes, nb, nbytes, r, s, wid, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; $ptr = $f.$ptr; _i = $f._i; _r = $f._r; _ref = $f._ref; _rune = $f._rune; b = $f.b; c = $f.c; i = $f.i; mapping = $f.mapping; maxbytes = $f.maxbytes; nb = $f.nb; nbytes = $f.nbytes; r = $f.r; s = $f.s; wid = $f.wid; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		maxbytes = s.length;
		nbytes = 0;
		b = sliceType.nil;
		_ref = s;
		_i = 0;
		/* while (true) { */ case 1:
			/* if (!(_i < _ref.length)) { break; } */ if(!(_i < _ref.length)) { $s = 2; continue; }
			_rune = $decodeRune(_ref, _i);
			i = _i;
			c = _rune[0];
			_r = mapping(c); /* */ $s = 3; case 3: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
			r = _r;
			if (b === sliceType.nil) {
				if (r === c) {
					_i += _rune[1];
					/* continue; */ $s = 1; continue;
				}
				b = $makeSlice(sliceType, maxbytes);
				nbytes = $copyString(b, $substring(s, 0, i));
			}
			if (r >= 0) {
				wid = 1;
				if (r >= 128) {
					wid = utf8.RuneLen(r);
				}
				if ((nbytes + wid >> 0) > maxbytes) {
					maxbytes = ($imul(maxbytes, 2)) + 4 >> 0;
					nb = $makeSlice(sliceType, maxbytes);
					$copySlice(nb, $subslice(b, 0, nbytes));
					b = nb;
				}
				nbytes = nbytes + (utf8.EncodeRune($subslice(b, nbytes, maxbytes), r)) >> 0;
			}
			_i += _rune[1];
		/* } */ $s = 1; continue; case 2:
		if (b === sliceType.nil) {
			$s = -1; return s;
		}
		$s = -1; return ($bytesToString($subslice(b, 0, nbytes)));
		/* */ } return; } if ($f === undefined) { $f = { $blk: Map }; } $f.$ptr = $ptr; $f._i = _i; $f._r = _r; $f._ref = _ref; $f._rune = _rune; $f.b = b; $f.c = c; $f.i = i; $f.mapping = mapping; $f.maxbytes = maxbytes; $f.nb = nb; $f.nbytes = nbytes; $f.r = r; $f.s = s; $f.wid = wid; $f.$s = $s; $f.$r = $r; return $f;
	};
	$pkg.Map = Map;
	ToUpper = function(s) {
		var $ptr, _r, s, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; $ptr = $f.$ptr; _r = $f._r; s = $f.s; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		_r = Map(unicode.ToUpper, s); /* */ $s = 1; case 1: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
		$s = -1; return _r;
		/* */ } return; } if ($f === undefined) { $f = { $blk: ToUpper }; } $f.$ptr = $ptr; $f._r = _r; $f.s = s; $f.$s = $s; $f.$r = $r; return $f;
	};
	$pkg.ToUpper = ToUpper;
	$init = function() {
		$pkg.$init = function() {};
		/* */ var $f, $c = false, $s = 0, $r; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		$r = errors.$init(); /* */ $s = 1; case 1: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
		$r = js.$init(); /* */ $s = 2; case 2: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
		$r = io.$init(); /* */ $s = 3; case 3: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
		$r = unicode.$init(); /* */ $s = 4; case 4: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
		$r = utf8.$init(); /* */ $s = 5; case 5: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
		/* */ } return; } if ($f === undefined) { $f = { $blk: $init }; } $f.$s = $s; $f.$r = $r; return $f;
	};
	$pkg.$init = $init;
	return $pkg;
})();
$packages["github.com/microo8/meh/golymer"] = (function() {
	var $pkg = {}, $init, js, reflect, strings, unicode, Element, sliceType, sliceType$1, ptrType, sliceType$2, ptrType$1, Define, kebabToCamelCase;
	js = $packages["github.com/gopherjs/gopherjs/js"];
	reflect = $packages["reflect"];
	strings = $packages["strings"];
	unicode = $packages["unicode"];
	Element = $pkg.Element = $newType(0, $kindStruct, "golymer.Element", true, "github.com/microo8/meh/golymer", true, function() {
		this.$val = this;
		if (arguments.length === 0) {
			return;
		}
	});
	sliceType = $sliceType($String);
	sliceType$1 = $sliceType($emptyInterface);
	ptrType = $ptrType(js.Object);
	sliceType$2 = $sliceType(ptrType);
	ptrType$1 = $ptrType(Element);
	Element.ptr.prototype.Template = function() {
		var $ptr, e;
		e = this;
		return "";
	};
	Element.prototype.Template = function() { return this.$val.Template(); };
	Element.ptr.prototype.ConnectedCallback = function() {
		var $ptr, e;
		e = this;
		console.log(e, "ConnectedCallback");
	};
	Element.prototype.ConnectedCallback = function() { return this.$val.ConnectedCallback(); };
	Element.ptr.prototype.DisconnectedCallback = function() {
		var $ptr, e;
		e = this;
		console.log(e, "DisconnectedCallback");
	};
	Element.prototype.DisconnectedCallback = function() { return this.$val.DisconnectedCallback(); };
	Element.ptr.prototype.AttributeChangedCallback = function(attributeName, oldValue, newValue, namespace) {
		var $ptr, attributeName, e, namespace, newValue, oldValue;
		e = this;
		console.log(e, "AttributeChangedCallback", attributeName, oldValue, newValue, namespace);
	};
	Element.prototype.AttributeChangedCallback = function(attributeName, oldValue, newValue, namespace) { return this.$val.AttributeChangedCallback(attributeName, oldValue, newValue, namespace); };
	Element.ptr.prototype.AdoptedCallback = function(oldDocument, newDocument) {
		var $ptr, e, newDocument, oldDocument;
		e = this;
		console.log(e, "AdoptedCallback", oldDocument, newDocument);
	};
	Element.prototype.AdoptedCallback = function(oldDocument, newDocument) { return this.$val.AdoptedCallback(oldDocument, newDocument); };
	Define = function(name, f) {
		var $ptr, _r, camelName, element, f, htmlElement, name, object, observedAttributes, prototype, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; $ptr = $f.$ptr; _r = $f._r; camelName = $f.camelName; element = $f.element; f = $f.f; htmlElement = $f.htmlElement; name = $f.name; object = $f.object; observedAttributes = $f.observedAttributes; prototype = $f.prototype; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		camelName = [camelName];
		f = [f];
		htmlElement = [htmlElement];
		observedAttributes = [observedAttributes];
		htmlElement[0] = $global.HTMLElement;
		object = $global.Object;
		_r = kebabToCamelCase(name); /* */ $s = 1; case 1: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
		camelName[0] = _r;
		observedAttributes[0] = sliceType.nil;
		element = js.MakeFunc((function(camelName, f, htmlElement, observedAttributes) { return function $b(this$1, argments) {
			var $ptr, _i, _r$1, _r$2, _r$3, _r$4, _ref, argments, customElement, customObject, customObjectType, field, i, instance, k, this$1, v, $s, $r;
			/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; $ptr = $f.$ptr; _i = $f._i; _r$1 = $f._r$1; _r$2 = $f._r$2; _r$3 = $f._r$3; _r$4 = $f._r$4; _ref = $f._ref; argments = $f.argments; customElement = $f.customElement; customObject = $f.customObject; customObjectType = $f.customObjectType; field = $f.field; i = $f.i; instance = $f.instance; k = $f.k; this$1 = $f.this$1; v = $f.v; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
			instance = $global.Reflect.construct(htmlElement[0], $externalize($makeSlice(sliceType$1, 0), sliceType$1), $global[$externalize(camelName[0], $String)]);
			_r$1 = f[0](); /* */ $s = 1; case 1: if($c) { $c = false; _r$1 = _r$1.$blk(); } if (_r$1 && _r$1.$blk !== undefined) { break s; }
			customObject = _r$1;
			_r$2 = reflect.TypeOf(customObject).Elem(); /* */ $s = 2; case 2: if($c) { $c = false; _r$2 = _r$2.$blk(); } if (_r$2 && _r$2.$blk !== undefined) { break s; }
			customObjectType = _r$2;
			i = 0;
			/* while (true) { */ case 3:
				_r$3 = customObjectType.NumField(); /* */ $s = 5; case 5: if($c) { $c = false; _r$3 = _r$3.$blk(); } if (_r$3 && _r$3.$blk !== undefined) { break s; }
				/* if (!(i < _r$3)) { break; } */ if(!(i < _r$3)) { $s = 4; continue; }
				_r$4 = customObjectType.Field(i); /* */ $s = 6; case 6: if($c) { $c = false; _r$4 = _r$4.$blk(); } if (_r$4 && _r$4.$blk !== undefined) { break s; }
				field = $clone(_r$4, reflect.StructField);
				if (field.PkgPath.length === 0) {
					observedAttributes[0] = $append(observedAttributes[0], field.Name);
				}
				i = i + (1) >> 0;
			/* } */ $s = 3; continue; case 4:
			customElement = js.MakeWrapper(customObject);
			instance._customElement = customElement;
			_ref = js.Keys(customElement);
			_i = 0;
			while (true) {
				if (!(_i < _ref.$length)) { break; }
				k = ((_i < 0 || _i >= _ref.$length) ? ($throwRuntimeError("index out of range"), undefined) : _ref.$array[_ref.$offset + _i]);
				v = customElement[$externalize(k, $String)];
				instance[$externalize(k, $String)] = v;
				_i++;
			}
			$s = -1; return new $jsObjectPtr(instance);
			/* */ } return; } if ($f === undefined) { $f = { $blk: $b }; } $f.$ptr = $ptr; $f._i = _i; $f._r$1 = _r$1; $f._r$2 = _r$2; $f._r$3 = _r$3; $f._r$4 = _r$4; $f._ref = _ref; $f.argments = argments; $f.customElement = customElement; $f.customObject = customObject; $f.customObjectType = customObjectType; $f.field = field; $f.i = i; $f.instance = instance; $f.k = k; $f.this$1 = this$1; $f.v = v; $f.$s = $s; $f.$r = $r; return $f;
		}; })(camelName, f, htmlElement, observedAttributes));
		$global[$externalize(camelName[0], $String)] = element;
		prototype = element.prototype;
		object.setPrototypeOf(prototype, htmlElement[0].prototype);
		object.setPrototypeOf(element, htmlElement[0]);
		prototype.observedAttributes = $externalize(observedAttributes[0], sliceType);
		prototype.connectedCallback = js.MakeFunc((function(camelName, f, htmlElement, observedAttributes) { return function(this$1, argments) {
			var $ptr, argments, this$1;
			return new $jsObjectPtr(this$1._customElement.ConnectedCallback($externalize(argments, sliceType$2)));
		}; })(camelName, f, htmlElement, observedAttributes));
		prototype.disconnectedCallback = js.MakeFunc((function(camelName, f, htmlElement, observedAttributes) { return function(this$1, argments) {
			var $ptr, argments, this$1;
			return new $jsObjectPtr(this$1._customElement.DisconnectedCallback($externalize(argments, sliceType$2)));
		}; })(camelName, f, htmlElement, observedAttributes));
		prototype.attributeChangedCallback = js.MakeFunc((function(camelName, f, htmlElement, observedAttributes) { return function(this$1, argments) {
			var $ptr, argments, this$1;
			return new $jsObjectPtr(this$1._customElement.AttributeChangedCallback($externalize(argments, sliceType$2)));
		}; })(camelName, f, htmlElement, observedAttributes));
		prototype.adoptedCallback = js.MakeFunc((function(camelName, f, htmlElement, observedAttributes) { return function(this$1, argments) {
			var $ptr, argments, this$1;
			return new $jsObjectPtr(this$1._customElement.AdoptedCallback($externalize(argments, sliceType$2)));
		}; })(camelName, f, htmlElement, observedAttributes));
		$global.customElements.define($externalize(name, $String), element);
		$s = -1; return;
		/* */ } return; } if ($f === undefined) { $f = { $blk: Define }; } $f.$ptr = $ptr; $f._r = _r; $f.camelName = camelName; $f.element = element; $f.f = f; $f.htmlElement = htmlElement; $f.name = name; $f.object = object; $f.observedAttributes = observedAttributes; $f.prototype = prototype; $f.$s = $s; $f.$r = $r; return $f;
	};
	$pkg.Define = Define;
	kebabToCamelCase = function(kebab) {
		var $ptr, _i, _r, _ref, _rune, camelCase, isToUpper, kebab, runeValue, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; $ptr = $f.$ptr; _i = $f._i; _r = $f._r; _ref = $f._ref; _rune = $f._rune; camelCase = $f.camelCase; isToUpper = $f.isToUpper; kebab = $f.kebab; runeValue = $f.runeValue; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		camelCase = "";
		isToUpper = false;
		_ref = kebab;
		_i = 0;
		/* while (true) { */ case 1:
			/* if (!(_i < _ref.length)) { break; } */ if(!(_i < _ref.length)) { $s = 2; continue; }
			_rune = $decodeRune(_ref, _i);
			runeValue = _rune[0];
			/* */ if (isToUpper) { $s = 3; continue; }
			/* */ $s = 4; continue;
			/* if (isToUpper) { */ case 3:
				_r = strings.ToUpper(($encodeRune(runeValue))); /* */ $s = 5; case 5: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
				camelCase = camelCase + (_r);
				isToUpper = false;
				_i += _rune[1];
				/* continue; */ $s = 1; continue;
			/* } */ case 4:
			if (runeValue === 45) {
				isToUpper = true;
			} else {
				camelCase = camelCase + (($encodeRune(runeValue)));
			}
			_i += _rune[1];
		/* } */ $s = 1; continue; case 2:
		$s = -1; return camelCase;
		/* */ } return; } if ($f === undefined) { $f = { $blk: kebabToCamelCase }; } $f.$ptr = $ptr; $f._i = _i; $f._r = _r; $f._ref = _ref; $f._rune = _rune; $f.camelCase = camelCase; $f.isToUpper = isToUpper; $f.kebab = kebab; $f.runeValue = runeValue; $f.$s = $s; $f.$r = $r; return $f;
	};
	ptrType$1.methods = [{prop: "Template", name: "Template", pkg: "", typ: $funcType([], [$String], false)}, {prop: "ConnectedCallback", name: "ConnectedCallback", pkg: "", typ: $funcType([], [], false)}, {prop: "DisconnectedCallback", name: "DisconnectedCallback", pkg: "", typ: $funcType([], [], false)}, {prop: "AttributeChangedCallback", name: "AttributeChangedCallback", pkg: "", typ: $funcType([$String, $String, $String, $String], [], false)}, {prop: "AdoptedCallback", name: "AdoptedCallback", pkg: "", typ: $funcType([$emptyInterface, $emptyInterface], [], false)}];
	Element.init("", []);
	$init = function() {
		$pkg.$init = function() {};
		/* */ var $f, $c = false, $s = 0, $r; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		$r = js.$init(); /* */ $s = 1; case 1: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
		$r = reflect.$init(); /* */ $s = 2; case 2: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
		$r = strings.$init(); /* */ $s = 3; case 3: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
		$r = unicode.$init(); /* */ $s = 4; case 4: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
		/* */ } return; } if ($f === undefined) { $f = { $blk: $init }; } $f.$s = $s; $f.$r = $r; return $f;
	};
	$pkg.$init = $init;
	return $pkg;
})();
$packages["github.com/microo8/meh/golymer/test"] = (function() {
	var $pkg = {}, $init, golymer, TestElem, ptrType, NewTestElem, main;
	golymer = $packages["github.com/microo8/meh/golymer"];
	TestElem = $pkg.TestElem = $newType(0, $kindStruct, "main.TestElem", true, "github.com/microo8/meh/golymer/test", true, function(Element_, ExportedAttribute_, unexportedAttribute_) {
		this.$val = this;
		if (arguments.length === 0) {
			this.Element = ptrType.nil;
			this.ExportedAttribute = "";
			this.unexportedAttribute = 0;
			return;
		}
		this.Element = Element_;
		this.ExportedAttribute = ExportedAttribute_;
		this.unexportedAttribute = unexportedAttribute_;
	});
	ptrType = $ptrType(golymer.Element);
	NewTestElem = function() {
		var $ptr;
		return new TestElem.ptr(new golymer.Element.ptr(), "", 0);
	};
	$pkg.NewTestElem = NewTestElem;
	main = function() {
		var $ptr, $s, $r;
		/* */ $s = 0; var $f, $c = false; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; $ptr = $f.$ptr; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		$r = golymer.Define("my-element", NewTestElem); /* */ $s = 1; case 1: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
		$s = -1; return;
		/* */ } return; } if ($f === undefined) { $f = { $blk: main }; } $f.$ptr = $ptr; $f.$s = $s; $f.$r = $r; return $f;
	};
	TestElem.init("github.com/microo8/meh/golymer/test", [{prop: "Element", name: "", exported: true, typ: ptrType, tag: ""}, {prop: "ExportedAttribute", name: "ExportedAttribute", exported: true, typ: $String, tag: ""}, {prop: "unexportedAttribute", name: "unexportedAttribute", exported: false, typ: $Int, tag: ""}]);
	$init = function() {
		$pkg.$init = function() {};
		/* */ var $f, $c = false, $s = 0, $r; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		$r = golymer.$init(); /* */ $s = 1; case 1: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
		/* */ if ($pkg === $mainPkg) { $s = 2; continue; }
		/* */ $s = 3; continue;
		/* if ($pkg === $mainPkg) { */ case 2:
			$r = main(); /* */ $s = 4; case 4: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
			$mainFinished = true;
		/* } */ case 3:
		/* */ } return; } if ($f === undefined) { $f = { $blk: $init }; } $f.$s = $s; $f.$r = $r; return $f;
	};
	$pkg.$init = $init;
	return $pkg;
})();
$synthesizeMethods();
var $mainPkg = $packages["github.com/microo8/meh/golymer/test"];
$packages["runtime"].$init();
$go($mainPkg.$init, []);
$flushConsole();

}).call(this);
//# sourceMappingURL=test.js.map
