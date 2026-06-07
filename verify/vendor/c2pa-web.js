// node_modules/highgain/dist/index.js
var l = Symbol("transfer");
function M(e, r) {
  return {
    type: l,
    value: e,
    transfer: r ? Array.isArray(r) ? r : [r] : [e]
  };
}
function p(e) {
  return !!(e && typeof e == "object" && Reflect.get(e, "type") === l);
}
function h(e = "default") {
  return {
    createTx(r) {
      const f2 = /* @__PURE__ */ new Map(), n = r ?? self;
      return n.addEventListener("message", (u2) => {
        const { data: o } = u2;
        if (o.channelName !== e)
          return;
        const { id: a, result: s, error: t } = o, c = f2.get(a);
        c && (t ? c.reject(t) : c.resolve(s), f2.delete(a));
      }), new Proxy(
        {},
        {
          get(u2, o) {
            return (...a) => {
              const s = g(), t = [], c = [];
              return a.forEach((i) => {
                p(i) ? (t.push(i.value), c.push(...i.transfer)) : t.push(i);
              }), n.postMessage(
                { method: o, args: t, id: s, channelName: e },
                { transfer: c }
              ), new Promise((i, y2) => {
                f2.set(s, { resolve: i, reject: y2 });
              });
            };
          }
        }
      );
    },
    rx(r, f2) {
      const n = f2 ?? self;
      n.addEventListener("message", async (d2) => {
        const { data: u2 } = d2;
        if (u2.channelName !== e)
          return;
        const { method: o, args: a, id: s } = u2;
        try {
          const t = await r[o](...a);
          p(t) ? n.postMessage(
            { result: t.value, id: s, channelName: e },
            { transfer: t.transfer }
          ) : n.postMessage({ result: t, id: s, channelName: e });
        } catch (t) {
          n.postMessage({ error: t, id: s, channelName: e });
        }
      });
    }
  };
}
function g() {
  return new Array(4).fill(0).map(() => Math.floor(Math.random() * Number.MAX_SAFE_INTEGER).toString(16)).join("-");
}

// node_modules/ts-deepmerge/esm/index.js
var isObject = (obj) => {
  if (typeof obj === "object" && obj !== null) {
    if (typeof Object.getPrototypeOf === "function") {
      const prototype = Object.getPrototypeOf(obj);
      return prototype === Object.prototype || prototype === null;
    }
    return Object.prototype.toString.call(obj) === "[object Object]";
  }
  return false;
};
var merge = (...objects) => objects.reduce((result, current) => {
  if (current === void 0) {
    return result;
  }
  if (Array.isArray(current)) {
    throw new TypeError("Arguments provided to ts-deepmerge must be objects, not arrays.");
  }
  Object.keys(current).forEach((key) => {
    if (["__proto__", "constructor", "prototype"].includes(key)) {
      return;
    }
    if (Array.isArray(result[key]) && Array.isArray(current[key])) {
      result[key] = merge.options.mergeArrays ? merge.options.uniqueArrayItems ? Array.from(new Set(result[key].concat(current[key]))) : [...result[key], ...current[key]] : current[key];
    } else if (isObject(result[key]) && isObject(current[key])) {
      result[key] = merge(result[key], current[key]);
    } else if (!isObject(result[key]) && isObject(current[key])) {
      result[key] = merge(current[key], void 0);
    } else {
      result[key] = current[key] === void 0 ? merge.options.allowUndefinedOverrides ? current[key] : result[key] : current[key];
    }
  });
  return result;
}, {});
var defaultOptions = {
  allowUndefinedOverrides: true,
  mergeArrays: true,
  uniqueArrayItems: true
};
merge.options = defaultOptions;
merge.withOptions = (options, ...objects) => {
  merge.options = Object.assign(Object.assign({}, defaultOptions), options);
  const result = merge(...objects);
  merge.options = defaultOptions;
  return result;
};

// node_modules/@contentauth/c2pa-web/dist/c2pa-DI2x_NCv.js
var { createTx: O, rx: Z } = h();
var { createTx: Q, rx: U } = h("worker");
var T = '(function(){"use strict";class p{static __wrap(e){const t=Object.create(p.prototype);return t.__wbg_ptr=e,x.register(t,t.__wbg_ptr,t),t}__destroy_into_raw(){const e=this.__wbg_ptr;return this.__wbg_ptr=0,x.unregister(this),e}free(){const e=this.__destroy_into_raw();o.__wbg_wasmbuilder_free(e,0)}addAction(e){const t=o.wasmbuilder_addAction(this.__wbg_ptr,e);if(t[1])throw d(t[0])}addIngredient(e){const t=b(e,o.__wbindgen_malloc,o.__wbindgen_realloc),n=u,_=o.wasmbuilder_addIngredient(this.__wbg_ptr,t,n);if(_[1])throw d(_[0])}addIngredientFromBlob(e,t,n){const _=b(e,o.__wbindgen_malloc,o.__wbindgen_realloc),c=u,i=b(t,o.__wbindgen_malloc,o.__wbindgen_realloc),s=u;return o.wasmbuilder_addIngredientFromBlob(this.__wbg_ptr,_,c,i,s,n)}addRedaction(e,t){const n=b(e,o.__wbindgen_malloc,o.__wbindgen_realloc),_=u,c=o.wasmbuilder_addRedaction(this.__wbg_ptr,n,_,t);if(c[1])throw d(c[0])}addResourceFromBlob(e,t){const n=b(e,o.__wbindgen_malloc,o.__wbindgen_realloc),_=u,c=o.wasmbuilder_addResourceFromBlob(this.__wbg_ptr,n,_,t);if(c[1])throw d(c[0])}static fromArchive(e,t){var n=g(t)?0:b(t,o.__wbindgen_malloc,o.__wbindgen_realloc),_=u;const c=o.wasmbuilder_fromArchive(e,n,_);if(c[2])throw d(c[1]);return p.__wrap(c[0])}static fromJson(e,t){const n=b(e,o.__wbindgen_malloc,o.__wbindgen_realloc),_=u;var c=g(t)?0:b(t,o.__wbindgen_malloc,o.__wbindgen_realloc),i=u;const s=o.wasmbuilder_fromJson(n,_,c,i);if(s[2])throw d(s[1]);return p.__wrap(s[0])}getDefinition(){const e=o.wasmbuilder_getDefinition(this.__wbg_ptr);if(e[2])throw d(e[1]);return d(e[0])}static new(e){var t=g(e)?0:b(e,o.__wbindgen_malloc,o.__wbindgen_realloc),n=u;const _=o.wasmbuilder_new(t,n);if(_[2])throw d(_[1]);return p.__wrap(_[0])}setIntent(e){const t=o.wasmbuilder_setIntent(this.__wbg_ptr,e);if(t[1])throw d(t[0])}setNoEmbed(e){o.wasmbuilder_setNoEmbed(this.__wbg_ptr,e)}setRemoteUrl(e){const t=b(e,o.__wbindgen_malloc,o.__wbindgen_realloc),n=u;o.wasmbuilder_setRemoteUrl(this.__wbg_ptr,t,n)}setThumbnailFromBlob(e,t){const n=b(e,o.__wbindgen_malloc,o.__wbindgen_realloc),_=u,c=o.wasmbuilder_setThumbnailFromBlob(this.__wbg_ptr,n,_,t);if(c[1])throw d(c[0])}sign(e,t,n){const _=b(t,o.__wbindgen_malloc,o.__wbindgen_realloc),c=u;return o.wasmbuilder_sign(this.__wbg_ptr,e,_,c,n)}signAndGetManifestBytes(e,t,n){const _=b(t,o.__wbindgen_malloc,o.__wbindgen_realloc),c=u;return o.wasmbuilder_signAndGetManifestBytes(this.__wbg_ptr,e,_,c,n)}toArchive(){const e=o.wasmbuilder_toArchive(this.__wbg_ptr);if(e[2])throw d(e[1]);return d(e[0])}}Symbol.dispose&&(p.prototype[Symbol.dispose]=p.prototype.free);class v{static __wrap(e){const t=Object.create(v.prototype);return t.__wbg_ptr=e,k.register(t,t.__wbg_ptr,t),t}__destroy_into_raw(){const e=this.__wbg_ptr;return this.__wbg_ptr=0,k.unregister(this),e}free(){const e=this.__destroy_into_raw();o.__wbg_wasmreader_free(e,0)}activeLabel(){const e=o.wasmreader_activeLabel(this.__wbg_ptr);let t;return e[0]!==0&&(t=y(e[0],e[1]).slice(),o.__wbindgen_free(e[0],e[1]*1,1)),t}activeManifest(){const e=o.wasmreader_activeManifest(this.__wbg_ptr);if(e[2])throw d(e[1]);return d(e[0])}crJson(){let e,t;try{const n=o.wasmreader_crJson(this.__wbg_ptr);return e=n[0],t=n[1],y(n[0],n[1])}finally{o.__wbindgen_free(e,t,1)}}static fromBlob(e,t,n){const _=b(e,o.__wbindgen_malloc,o.__wbindgen_realloc),c=u;var i=g(n)?0:b(n,o.__wbindgen_malloc,o.__wbindgen_realloc),s=u;return o.wasmreader_fromBlob(_,c,t,i,s)}static fromBlobFragment(e,t,n,_){const c=b(e,o.__wbindgen_malloc,o.__wbindgen_realloc),i=u;var s=g(_)?0:b(_,o.__wbindgen_malloc,o.__wbindgen_realloc),a=u;return o.wasmreader_fromBlobFragment(c,i,t,n,s,a)}json(){let e,t;try{const n=o.wasmreader_json(this.__wbg_ptr);return e=n[0],t=n[1],y(n[0],n[1])}finally{o.__wbindgen_free(e,t,1)}}manifestStore(){const e=o.wasmreader_manifestStore(this.__wbg_ptr);if(e[2])throw d(e[1]);return d(e[0])}resourceToBytes(e){const t=b(e,o.__wbindgen_malloc,o.__wbindgen_realloc),n=u,_=o.wasmreader_resourceToBytes(this.__wbg_ptr,t,n);if(_[2])throw d(_[1]);return d(_[0])}}Symbol.dispose&&(v.prototype[Symbol.dispose]=v.prototype.free);function C(r){const e=b(r,o.__wbindgen_malloc,o.__wbindgen_realloc),t=u,n=o.loadSettings(e,t);if(n[1])throw d(n[0])}function J(){return{__proto__:null,"./c2pa_bg.js":{__proto__:null,__wbg_Error_ef53bc310eb298a0:function(e,t){return Error(y(e,t))},__wbg_Number_6b506e6536831eaa:function(e){return Number(e)},__wbg___wbindgen_bigint_get_as_i64_38130e98eecd467d:function(e,t){const n=t,_=typeof n=="bigint"?n:void 0;m().setBigInt64(e+8,g(_)?BigInt(0):_,!0),m().setInt32(e+0,!g(_),!0)},__wbg___wbindgen_boolean_get_1a45e2c38d4d41b9:function(e){const t=e,n=typeof t=="boolean"?t:void 0;return g(n)?16777215:n?1:0},__wbg___wbindgen_debug_string_0accd80f45e5faa2:function(e,t){const n=j(t),_=b(n,o.__wbindgen_malloc,o.__wbindgen_realloc),c=u;m().setInt32(e+4,c,!0),m().setInt32(e+0,_,!0)},__wbg___wbindgen_in_70a403a56e771704:function(e,t){return e in t},__wbg___wbindgen_is_bigint_6ffd6468a9bc44b9:function(e){return typeof e=="bigint"},__wbg___wbindgen_is_function_754e9f305ff6029e:function(e){return typeof e=="function"},__wbg___wbindgen_is_object_56732c2bc353f41d:function(e){const t=e;return typeof t=="object"&&t!==null},__wbg___wbindgen_is_string_c236cabd84a4d769:function(e){return typeof e=="string"},__wbg___wbindgen_is_undefined_67b456be8673d3d7:function(e){return e===void 0},__wbg___wbindgen_jsval_eq_1068e624fa87f6ab:function(e,t){return e===t},__wbg___wbindgen_jsval_loose_eq_2c56564c75129511:function(e,t){return e==t},__wbg___wbindgen_number_get_9bb1761122181af2:function(e,t){const n=t,_=typeof n=="number"?n:void 0;m().setFloat64(e+8,g(_)?0:_,!0),m().setInt32(e+0,!g(_),!0)},__wbg___wbindgen_string_get_72bdf95d3ae505b1:function(e,t){const n=t,_=typeof n=="string"?n:void 0;var c=g(_)?0:b(_,o.__wbindgen_malloc,o.__wbindgen_realloc),i=u;m().setInt32(e+4,i,!0),m().setInt32(e+0,c,!0)},__wbg___wbindgen_throw_1506f2235d1bdba0:function(e,t){throw new Error(y(e,t))},__wbg__wbg_cb_unref_61db23ac97f16c31:function(e){e._wbg_cb_unref()},__wbg_abort_2ec46222bf378517:function(e){e.abort()},__wbg_abort_b29d719932441c95:function(e,t){e.abort(t)},__wbg_append_e1746995edcb0170:function(){return f(function(e,t,n,_,c){e.append(y(t,n),y(_,c))},arguments)},__wbg_arrayBuffer_05927079aabe6d46:function(){return f(function(e){return e.arrayBuffer()},arguments)},__wbg_byteLength_2c6dc3b4b85d3547:function(e){return e.byteLength},__wbg_call_8a89609d89f6608a:function(){return f(function(e,t){return e.call(t)},arguments)},__wbg_call_9c758de292015997:function(){return f(function(e,t,n){return e.call(t,n)},arguments)},__wbg_clearTimeout_6b8d9a38b9263d65:function(e){return clearTimeout(e)},__wbg_crypto_38df2bab126b63dc:function(e){return e.crypto},__wbg_done_60cf307fcc680536:function(e){return e.done},__wbg_entries_04b37a02507f1713:function(e){return Object.entries(e)},__wbg_error_a6fa202b58aa1cd3:function(e,t){let n,_;try{n=e,_=t,console.error(y(e,t))}finally{o.__wbindgen_free(n,_,1)}},__wbg_fetch_344c8d3849002659:function(e,t){return e.fetch(t)},__wbg_fetch_9dad4fe911207b37:function(e){return fetch(e)},__wbg_from_d300fe49deab18f5:function(e){return Array.from(e)},__wbg_getRandomValues_3f44b700395062e5:function(){return f(function(e,t){globalThis.crypto.getRandomValues(A(e,t))},arguments)},__wbg_getRandomValues_8aa3112c6615eef6:function(){return f(function(e,t){globalThis.crypto.getRandomValues(A(e,t))},arguments)},__wbg_getRandomValues_c44a50d8cfdaebeb:function(){return f(function(e,t){e.getRandomValues(t)},arguments)},__wbg_getTime_00b3f7db575e4ef5:function(e){return e.getTime()},__wbg_get_1f8f054ddbaa7db2:function(){return f(function(e,t){return Reflect.get(e,t)},arguments)},__wbg_get_2b48c7d0d006a781:function(e,t){return e[t>>>0]},__wbg_get_de6a0f7d4d18a304:function(){return f(function(e,t){return Reflect.get(e,t)},arguments)},__wbg_get_unchecked_33f6e5c9e2f2d6b2:function(e,t){return e[t>>>0]},__wbg_get_with_ref_key_6412cf3094599694:function(e,t){return e[t]},__wbg_has_73740b27f436fed3:function(){return f(function(e,t){return Reflect.has(e,t)},arguments)},__wbg_headers_0feb63d2d374b44a:function(e){return e.headers},__wbg_instanceof_ArrayBuffer_8f49811467741499:function(e){let t;try{t=e instanceof ArrayBuffer}catch{t=!1}return t},__wbg_instanceof_Map_9fc06d9a951bcee6:function(e){let t;try{t=e instanceof Map}catch{t=!1}return t},__wbg_instanceof_Promise_d0db99486956c8e8:function(e){let t;try{t=e instanceof Promise}catch{t=!1}return t},__wbg_instanceof_Response_cb984bd66d7bd408:function(e){let t;try{t=e instanceof Response}catch{t=!1}return t},__wbg_instanceof_Uint8Array_86f30649f63ef9c2:function(e){let t;try{t=e instanceof Uint8Array}catch{t=!1}return t},__wbg_isArray_67c2c9c4313f4448:function(e){return Array.isArray(e)},__wbg_isSafeInteger_66acec27e09e99a7:function(e){return Number.isSafeInteger(e)},__wbg_iterator_8732428d309e270e:function(){return Symbol.iterator},__wbg_length_4a591ecaa01354d9:function(e){return e.length},__wbg_length_66f1a4b2e9026940:function(e){return e.length},__wbg_msCrypto_bd5a034af96bcba6:function(e){return e.msCrypto},__wbg_new_0_445c13a750296eb6:function(){return new Date},__wbg_new_0d09705104e164af:function(){return f(function(){return new AbortController},arguments)},__wbg_new_227d7c05414eb861:function(){return new Error},__wbg_new_578aeef4b6b94378:function(e){return new Uint8Array(e)},__wbg_new_622fc80556be2e26:function(){return new Map},__wbg_new_a1b9f645bba64f0f:function(){return f(function(){return new FileReaderSync},arguments)},__wbg_new_ce1ab61c1c2b300d:function(){return new Object},__wbg_new_d90091b82fdf5b91:function(){return new Array},__wbg_new_e436d06bc8e77460:function(){return f(function(){return new Headers},arguments)},__wbg_new_from_slice_18fa1f71286d66b8:function(e,t){return new Uint8Array(A(e,t))},__wbg_new_typed_bf31d18f92484486:function(e,t){try{var n={a:e,b:t},_=(i,s)=>{const a=n.a;n.a=0;try{return P(a,n.b,i,s)}finally{n.a=a}};return new Promise(_)}finally{n.a=0}},__wbg_new_with_length_36a4998e27b014c5:function(e){return new Uint8Array(e>>>0)},__wbg_new_with_str_and_init_bcd02b79a793d27f:function(){return f(function(e,t,n){return new Request(y(e,t),n)},arguments)},__wbg_next_9e03acdf51c4960d:function(e){return e.next},__wbg_next_eb8ca7351fa27906:function(){return f(function(e){return e.next()},arguments)},__wbg_node_84ea875411254db1:function(e){return e.node},__wbg_now_190933fa139cc119:function(){return Date.now()},__wbg_process_44c7a14e11e9f69e:function(e){return e.process},__wbg_prototypesetcall_3249fc62a0fafa30:function(e,t,n){Uint8Array.prototype.set.call(A(e,t),n)},__wbg_queueMicrotask_35c611f4a14830b2:function(e){queueMicrotask(e)},__wbg_queueMicrotask_404ed0a58e0b63cc:function(e){return e.queueMicrotask},__wbg_randomFillSync_6c25eac9869eb53c:function(){return f(function(e,t){e.randomFillSync(t)},arguments)},__wbg_readAsArrayBuffer_f1b8da05559618d9:function(){return f(function(e,t){return e.readAsArrayBuffer(t)},arguments)},__wbg_require_b4edbdcf3e2a1ef0:function(){return f(function(){return module.require},arguments)},__wbg_resolve_25a7e548d5881dca:function(e){return Promise.resolve(e)},__wbg_setTimeout_f757f00851f76c42:function(e,t){return setTimeout(e,t)},__wbg_set_29c99a8aac1c01e5:function(e,t,n){e.set(A(t,n))},__wbg_set_52b1e1eb5bed906a:function(e,t,n){return e.set(t,n)},__wbg_set_6be42768c690e380:function(e,t,n){e[t]=n},__wbg_set_body_36614c7e61546809:function(e,t){e.body=t},__wbg_set_cache_488ea16c11cbf20d:function(e,t){e.cache=$[t]},__wbg_set_credentials_fa9c491a27c4bdf0:function(e,t){e.credentials=H[t]},__wbg_set_dca99999bba88a9a:function(e,t,n){e[t>>>0]=n},__wbg_set_headers_7c1e39ece7826bec:function(e,t){e.headers=t},__wbg_set_method_7a6811dec7a4feff:function(e,t,n){e.method=y(t,n)},__wbg_set_mode_c90e3667002857d4:function(e,t){e.mode=X[t]},__wbg_set_signal_d9da62b3f215c821:function(e,t){e.signal=t},__wbg_signal_e03304a84df9ed09:function(e){return e.signal},__wbg_size_9970092b88b1094c:function(e){return e.size},__wbg_slice_02bb778501725738:function(){return f(function(e,t,n){return e.slice(t,n)},arguments)},__wbg_stack_3b0d974bbf31e44f:function(e,t){const n=t.stack,_=b(n,o.__wbindgen_malloc,o.__wbindgen_realloc),c=u;m().setInt32(e+4,c,!0),m().setInt32(e+0,_,!0)},__wbg_static_accessor_GLOBAL_9d53f2689e622ca1:function(){const e=typeof global>"u"?null:global;return g(e)?0:S(e)},__wbg_static_accessor_GLOBAL_THIS_a1a35cec07001a8a:function(){const e=typeof globalThis>"u"?null:globalThis;return g(e)?0:S(e)},__wbg_static_accessor_SELF_4c59f6c7ea29a144:function(){const e=typeof self>"u"?null:self;return g(e)?0:S(e)},__wbg_static_accessor_WINDOW_e70ae9f2eb052253:function(){const e=typeof window>"u"?null:window;return g(e)?0:S(e)},__wbg_status_00549d55b78d949e:function(e){return e.status},__wbg_stringify_8286df6dcc591521:function(){return f(function(e){return JSON.stringify(e)},arguments)},__wbg_subarray_4aa221f6a4f5ab22:function(e,t,n){return e.subarray(t>>>0,n>>>0)},__wbg_then_18f476d590e58992:function(e,t,n){return e.then(t,n)},__wbg_then_ac7b025999b52837:function(e,t){return e.then(t)},__wbg_url_6808f1c468f2d0cd:function(e,t){const n=t.url,_=b(n,o.__wbindgen_malloc,o.__wbindgen_realloc),c=u;m().setInt32(e+4,c,!0),m().setInt32(e+0,_,!0)},__wbg_valueOf_41ae57308c1f031c:function(e){return e.valueOf()},__wbg_value_f3625092ee4b37f4:function(e){return e.value},__wbg_versions_276b2795b1c6a219:function(e){return e.versions},__wbg_wasmreader_new:function(e){return v.__wrap(e)},__wbindgen_cast_0000000000000001:function(e,t){return z(e,t,G)},__wbindgen_cast_0000000000000002:function(e,t){return z(e,t,V)},__wbindgen_cast_0000000000000003:function(e){return e},__wbindgen_cast_0000000000000004:function(e){return e},__wbindgen_cast_0000000000000005:function(e,t){return A(e,t)},__wbindgen_cast_0000000000000006:function(e,t){return y(e,t)},__wbindgen_cast_0000000000000007:function(e){return BigInt.asUintN(64,e)},__wbindgen_cast_0000000000000008:function(e,t){var n=A(e,t).slice();return o.__wbindgen_free(e,t*1,1),n},__wbindgen_init_externref_table:function(){const e=o.__wbindgen_externrefs,t=e.grow(4);e.set(0,void 0),e.set(t+0,void 0),e.set(t+1,null),e.set(t+2,!0),e.set(t+3,!1)}}}}function V(r,e){o.wasm_bindgen__convert__closures_____invoke__h9ad77c532ffa5b9e(r,e)}function G(r,e,t){const n=o.wasm_bindgen__convert__closures_____invoke__hf2acc361175a8d00(r,e,t);if(n[1])throw d(n[0])}function P(r,e,t,n){o.wasm_bindgen__convert__closures_____invoke__h53f6302d12a3bd57(r,e,t,n)}const $=["default","no-store","reload","no-cache","force-cache","only-if-cached"],H=["omit","same-origin","include"],X=["same-origin","no-cors","cors","navigate"],x=typeof FinalizationRegistry>"u"?{register:()=>{},unregister:()=>{}}:new FinalizationRegistry(r=>o.__wbg_wasmbuilder_free(r,1)),k=typeof FinalizationRegistry>"u"?{register:()=>{},unregister:()=>{}}:new FinalizationRegistry(r=>o.__wbg_wasmreader_free(r,1));typeof FinalizationRegistry>"u"||new FinalizationRegistry(r=>o.__wbg_wasmsigner_free(r,1));function S(r){const e=o.__externref_table_alloc();return o.__wbindgen_externrefs.set(e,r),e}const N=typeof FinalizationRegistry>"u"?{register:()=>{},unregister:()=>{}}:new FinalizationRegistry(r=>o.__wbindgen_destroy_closure(r.a,r.b));function j(r){const e=typeof r;if(e=="number"||e=="boolean"||r==null)return`${r}`;if(e=="string")return`"${r}"`;if(e=="symbol"){const _=r.description;return _==null?"Symbol":`Symbol(${_})`}if(e=="function"){const _=r.name;return typeof _=="string"&&_.length>0?`Function(${_})`:"Function"}if(Array.isArray(r)){const _=r.length;let c="[";_>0&&(c+=j(r[0]));for(let i=1;i<_;i++)c+=", "+j(r[i]);return c+="]",c}const t=/\\[object ([^\\]]+)\\]/.exec(toString.call(r));let n;if(t&&t.length>1)n=t[1];else return toString.call(r);if(n=="Object")try{return"Object("+JSON.stringify(r)+")"}catch{return"Object"}return r instanceof Error?`${r.name}: ${r.message}\n${r.stack}`:n}function A(r,e){return r=r>>>0,M().subarray(r/1,r/1+e)}let F=null;function m(){return(F===null||F.buffer.detached===!0||F.buffer.detached===void 0&&F.buffer!==o.memory.buffer)&&(F=new DataView(o.memory.buffer)),F}function y(r,e){return K(r>>>0,e)}let B=null;function M(){return(B===null||B.byteLength===0)&&(B=new Uint8Array(o.memory.buffer)),B}function f(r,e){try{return r.apply(this,e)}catch(t){const n=S(t);o.__wbindgen_exn_store(n)}}function g(r){return r==null}function z(r,e,t){const n={a:r,b:e,cnt:1},_=(...c)=>{n.cnt++;const i=n.a;n.a=0;try{return t(i,n.b,...c)}finally{n.a=i,_._wbg_cb_unref()}};return _._wbg_cb_unref=()=>{--n.cnt===0&&(o.__wbindgen_destroy_closure(n.a,n.b),n.a=0,N.unregister(n))},N.register(_,n,n),_}function b(r,e,t){if(t===void 0){const s=T.encode(r),a=e(s.length,1)>>>0;return M().subarray(a,a+s.length).set(s),u=s.length,a}let n=r.length,_=e(n,1)>>>0;const c=M();let i=0;for(;i<n;i++){const s=r.charCodeAt(i);if(s>127)break;c[_+i]=s}if(i!==n){i!==0&&(r=r.slice(i)),_=t(_,n,n=i+r.length*3,1)>>>0;const s=M().subarray(_+i,_+n),a=T.encodeInto(r,s);i+=a.written,_=t(_,n,i,1)>>>0}return u=i,_}function d(r){const e=o.__wbindgen_externrefs.get(r);return o.__externref_table_dealloc(r),e}let E=new TextDecoder("utf-8",{ignoreBOM:!0,fatal:!0});E.decode();const Y=2146435072;let O=0;function K(r,e){return O+=e,O>=Y&&(E=new TextDecoder("utf-8",{ignoreBOM:!0,fatal:!0}),E.decode(),O=e),E.decode(M().subarray(r,r+e))}const T=new TextEncoder;"encodeInto"in T||(T.encodeInto=function(r,e){const t=T.encode(r);return e.set(t),{read:r.length,written:t.length}});let u=0,o;function Q(r,e){return o=r.exports,F=null,B=null,o.__wbindgen_start(),o}function Z(r){if(o!==void 0)return o;r!==void 0&&(Object.getPrototypeOf(r)===Object.prototype?{module:r}=r:console.warn("using deprecated parameters for `initSync()`; pass a single object instead"));const e=J();r instanceof WebAssembly.Module||(r=new WebAssembly.Module(r));const t=new WebAssembly.Instance(r,e);return Q(t)}function D(){let r=0;const e=new Map;return{add(t){const n=r++;return e.set(n,t),n},get(t){const n=e.get(t);if(!n)throw new Error("Attempted to use an object that has been freed");return n},remove(t){return e.delete(t)}}}const L=Symbol("transfer");function I(r,e){return{type:L,value:r,transfer:e?Array.isArray(e)?e:[e]:[r]}}function U(r){return!!(r&&typeof r=="object"&&Reflect.get(r,"type")===L)}function q(r="default"){return{createTx(e){const t=new Map,n=e??self;return n.addEventListener("message",_=>{const{data:c}=_;if(c.channelName!==r)return;const{id:i,result:s,error:a}=c,w=t.get(i);w&&(a?w.reject(a):w.resolve(s),t.delete(i))}),new Proxy({},{get(_,c){return(...i)=>{const s=ee(),a=[],w=[];return i.forEach(R=>{U(R)?(a.push(R.value),w.push(...R.transfer)):a.push(R)}),n.postMessage({method:c,args:a,id:s,channelName:r},{transfer:w}),new Promise((R,_e)=>{t.set(s,{resolve:R,reject:_e})})}}})},rx(e,t){const n=t??self;n.addEventListener("message",async _=>{const{data:c}=_;if(c.channelName!==r)return;const{method:i,args:s,id:a}=c;try{const w=await e[i](...s);U(w)?n.postMessage({result:w.value,id:a,channelName:r},{transfer:w.transfer}):n.postMessage({result:w,id:a,channelName:r})}catch(w){n.postMessage({error:w,id:a,channelName:r})}})}}}function ee(){return new Array(4).fill(0).map(()=>Math.floor(Math.random()*Number.MAX_SAFE_INTEGER).toString(16)).join("-")}const{rx:te}=q(),{createTx:ne}=q("worker"),h=D(),l=D(),W=ne();te(re({async initWorker(r,e){Z({module:r}),e&&C(e)},async reader_fromBlob(r,e,t){const n=await v.fromBlob(r,e,t);return h.add(n)},async reader_fromBlobFragment(r,e,t,n){const _=await v.fromBlobFragment(r,e,t,n);return h.add(_)},reader_activeLabel(r){return h.get(r).activeLabel()??null},reader_manifestStore(r){return h.get(r).manifestStore()},reader_activeManifest(r){return h.get(r).activeManifest()},reader_json(r){return h.get(r).json()},reader_crJson(r){return h.get(r).crJson()},reader_resourceToBytes(r,e){const n=h.get(r).resourceToBytes(e);return I(n,n.buffer)},reader_free(r){h.get(r).free(),h.remove(r)},builder_new(r){const e=p.new(r);return l.add(e)},builder_fromJson(r,e){const t=p.fromJson(r,e);return l.add(t)},builder_fromArchive(r,e){const t=p.fromArchive(r,e);return l.add(t)},builder_setIntent(r,e){l.get(r).setIntent(e)},builder_addAction(r,e){l.get(r).addAction(e)},builder_addRedaction(r,e,t){l.get(r).addRedaction(e,t)},builder_setRemoteUrl(r,e){l.get(r).setRemoteUrl(e)},builder_setNoEmbed(r,e){l.get(r).setNoEmbed(e)},builder_setThumbnailFromBlob(r,e,t){l.get(r).setThumbnailFromBlob(e,t)},builder_addIngredient(r,e){l.get(r).addIngredient(e)},async builder_addIngredientFromBlob(r,e,t,n){await l.get(r).addIngredientFromBlob(e,t,n)},builder_addResourceFromBlob(r,e,t){l.get(r).addResourceFromBlob(e,t)},builder_getDefinition(r){return l.get(r).getDefinition()},builder_toArchive(r){const t=l.get(r).toArchive();return I(t,t.buffer)},async builder_sign(r,e,t,n,_){const i=await l.get(r).sign({reserveSize:t.reserveSize,alg:t.alg,sign:async s=>await W.sign(e,I(s,s.buffer),t.reserveSize)},n,_);return I(i,i.buffer)},async builder_signAndGetManifestBytes(r,e,t,n,_){const c=l.get(r),{manifest:i,asset:s}=await c.signAndGetManifestBytes({reserveSize:t.reserveSize,alg:t.alg,sign:async a=>await W.sign(e,I(a,a.buffer),t.reserveSize)},n,_);return I({manifest:i,asset:s},[i.buffer,s.buffer])},builder_free(r){l.get(r).free(),l.remove(r)}}));function re(r){const e={};for(const[t,n]of Object.entries(r))e[t]=async(..._)=>{try{return await n(..._)}catch(c){throw typeof c=="string"?new Error(c):c}};return e}})();\n';
var m = typeof self < "u" && self.Blob && new Blob([T], { type: "text/javascript;charset=utf-8" });
function L(t) {
  let e;
  try {
    if (e = m && (self.URL || self.webkitURL).createObjectURL(m), !e) throw "";
    const _ = new Worker(e, {
      name: t == null ? void 0 : t.name
    });
    return _.addEventListener("error", () => {
      (self.URL || self.webkitURL).revokeObjectURL(e);
    }), _;
  } catch {
    return new Worker(
      "data:text/javascript;charset=utf-8," + encodeURIComponent(T),
      {
        name: t == null ? void 0 : t.name
      }
    );
  } finally {
    e && (self.URL || self.webkitURL).revokeObjectURL(e);
  }
}
async function k(t) {
  const { wasm: e, settingsString: _ } = t;
  let r = 0;
  const n = new L(), o = O(n), i = /* @__PURE__ */ new Map();
  U(
    {
      sign: async (s, c, j) => {
        const l2 = i.get(s);
        if (i.delete(s), !l2)
          throw new Error("No signer registered for request");
        const w = await l2(c, j);
        return M(w, w.buffer);
      }
    },
    n
  );
  function a(s) {
    const c = r++;
    return i.set(c, s), c;
  }
  return await o.initWorker(e, _), {
    tx: o,
    registerSignReceiver: a,
    terminate: () => n.terminate()
  };
}
var y = class extends Error {
  constructor(e) {
    super(
      `The provided asset was too large. Size: ${e} bytes. Maximum: ${g2}.`
    ), this.name = "AssetTooLargeError";
  }
};
var h2 = class extends Error {
  constructor(e) {
    super(`Unsupported format: ${e}.`), this.name = "UnsupportedFormatError";
  }
};
var J = [
  "jpg",
  "video/mp4",
  "image/heif",
  "video/x-msvideo",
  "pdf",
  "image/png",
  "application/c2pa",
  "video/quicktime",
  "video/avi",
  "image/gif",
  "application/xml",
  "text/xml",
  "application/xhtml+xml",
  "tiff",
  "audio/wave",
  "mp4",
  "image/avif",
  "image/dng",
  "png",
  "dng",
  "image/svg+xml",
  "image/heic",
  "application/mp4",
  "image/x-nikon-nef",
  "video/msvideo",
  "tif",
  "wav",
  "xml",
  "audio/vnd.wave",
  "xhtml",
  "gif",
  "application/x-troff-msvideo",
  "webp",
  "heic",
  "application/pdf",
  "audio/mpeg",
  "application/x-c2pa-manifest-store",
  "jpeg",
  "image/x-adobe-dng",
  "audio/wav",
  "mp3",
  "mov",
  "image/tiff",
  "audio/mp4",
  "application/svg+xml",
  "arw",
  "c2pa",
  "svg",
  "avi",
  "audio/x-wav",
  "m4a",
  "image/x-sony-arw",
  "image/jpeg",
  "avif",
  "image/webp",
  "nef",
  "heif"
];
function p2(t) {
  return J.includes(t);
}
var P = {
  userAnchors: true,
  trustAnchors: true,
  trustConfig: true,
  allowedList: true
};
var $ = Object.keys(P);
var D = {
  builder: {
    generateC2paArchive: true
  }
};
var v = 1 * 1024 * 1024;
async function u(t) {
  const e = merge(D, t), _ = [];
  return e.trust && _.push(R(e.trust)), e.cawgTrust && _.push(R(e.cawgTrust)), await Promise.all(_), JSON.stringify(M2(e));
}
function M2(t) {
  return Object.entries(t).reduce(
    (_, [r, n]) => (_[C(r)] = typeof n == "object" && n !== null ? M2(n) : n, _),
    {}
  );
}
function C(t) {
  return t.replace(/[A-Z]/g, (e) => `_${e.toLowerCase()}`);
}
async function R(t) {
  try {
    const e = Object.entries(t).filter(([_]) => $.includes(_)).map(async ([_, r]) => {
      if (r && typeof r == "object" && Array.isArray(r)) {
        const n = r.map(async (a) => {
          if (typeof a != "string")
            throw new Error("Expected a string value for array item");
          const s = await F(a);
          if (S(_) && !A(s))
            throw new Error(`Error parsing PEM file at: ${a}`);
          return s;
        }), i = (await Promise.all(n)).join("");
        t[_] = i;
      } else if (r && typeof r == "string" && W(r)) {
        const n = await F(r);
        if (S(_) && !A(n))
          throw new Error(`Error parsing PEM file at: ${r}`);
        t[_] = n;
      } else
        return r;
    });
    await Promise.all(e);
  } catch (e) {
    const _ = e instanceof Error ? e.message : String(e);
    throw new Error(`Failed to resolve trust settings. ${_}`, { cause: e });
  }
}
var S = (t) => ["userAnchors", "trustAnchors"].includes(t);
var A = (t) => t.includes("-----BEGIN CERTIFICATE-----");
var W = (t) => t.startsWith("http");
async function F(t) {
  let e;
  try {
    e = await fetch(t);
  } catch (r) {
    const n = r instanceof Error ? r.message : String(r);
    throw new Error(`Network error fetching ${t}: ${n}`, { cause: r });
  }
  if (!e.ok)
    throw new Error(`Failed to fetch ${t}: ${e.status} ${e.statusText}`);
  const _ = await e.text();
  if (_.length > v)
    throw new Error(`Response from ${t} is too large. Max size is ${v} bytes.`);
  return _;
}
var g2 = 10 ** 9;
function q(t) {
  const { tx: e } = t, _ = new FinalizationRegistry(async (r) => {
    await e.reader_free(r);
  });
  return {
    async fromBlob(r, n, o) {
      if (!p2(r))
        throw new h2(r);
      if (n.size > g2)
        throw new y(n.size);
      try {
        const i = o && await u(o), a = await e.reader_fromBlob(r, n, i), s = B(t, a, () => {
          _.unregister(s);
        });
        return _.register(s, a, s), s;
      } catch (i) {
        return x(i);
      }
    },
    async fromBlobFragment(r, n, o, i) {
      if (!p2(r))
        throw new h2(r);
      if (n.size > g2)
        throw new y(n.size);
      try {
        const a = i && await u(i), s = await e.reader_fromBlobFragment(
          r,
          n,
          o,
          a
        ), c = B(t, s, () => {
          _.unregister(c);
        });
        return _.register(c, s, c), c;
      } catch (a) {
        return x(a);
      }
    }
  };
}
function x(t) {
  if (t instanceof Error && t.message === "C2pa(JumbfNotFound)")
    return null;
  throw t;
}
function B(t, e, _) {
  const { tx: r } = t;
  return {
    async activeLabel() {
      return await r.reader_activeLabel(e);
    },
    async manifestStore() {
      return await r.reader_manifestStore(e);
    },
    async activeManifest() {
      return await r.reader_activeManifest(e);
    },
    async json() {
      const n = await r.reader_json(e);
      return JSON.parse(n);
    },
    async crJson() {
      const n = await r.reader_crJson(e);
      return JSON.parse(n);
    },
    async resourceToBytes(n) {
      return await r.reader_resourceToBytes(e, n);
    },
    async free() {
      _(), await r.reader_free(e);
    }
  };
}
typeof FinalizationRegistry > "u" || new FinalizationRegistry((t) => f.__wbg_wasmbuilder_free(t, 1));
typeof FinalizationRegistry > "u" || new FinalizationRegistry((t) => f.__wbg_wasmreader_free(t, 1));
typeof FinalizationRegistry > "u" || new FinalizationRegistry((t) => f.__wbg_wasmsigner_free(t, 1));
typeof FinalizationRegistry > "u" || new FinalizationRegistry((t) => f.__wbindgen_destroy_closure(t.a, t.b));
var G = new TextDecoder("utf-8", { ignoreBOM: true, fatal: true });
G.decode();
var b = new TextEncoder();
"encodeInto" in b || (b.encodeInto = function(t, e) {
  const _ = b.encode(t);
  return e.set(_), {
    read: t.length,
    written: _.length
  };
});
var f;
var V = "sha512-2nvIDEdLBQHSJJqGx1M7hxP8Pyg5rhmPX/Ag0CsgzbeTUrh8zdR0YpwhN8S9ifoqN+ia3BkETxLcmUFmF0ptwA==";
async function E(t) {
  const { alg: e } = t;
  return {
    reserveSize: await t.reserveSize(),
    alg: e
  };
}
function X(t) {
  const { tx: e } = t, _ = new FinalizationRegistry((r) => {
    e.builder_free(r);
  });
  return {
    async new(r) {
      const n = r && await u(r), o = await e.builder_new(n), i = d(t, o, () => {
        _.unregister(i);
      });
      return _.register(i, o, i), i;
    },
    async fromDefinition(r, n) {
      const o = JSON.stringify(r), i = n && await u(n), a = await e.builder_fromJson(o, i), s = d(t, a, () => {
        _.unregister(s);
      });
      return _.register(s, a, s), s;
    },
    async fromArchive(r, n) {
      const o = n && await u(n), i = await e.builder_fromArchive(r, o), a = d(t, i, () => {
        _.unregister(a);
      });
      return _.register(a, i, a), a;
    }
  };
}
function d(t, e, _) {
  const { tx: r } = t;
  return {
    async setIntent(n) {
      await r.builder_setIntent(e, n);
    },
    async addAction(n) {
      await r.builder_addAction(e, n);
    },
    async addRedaction(n, o) {
      await r.builder_addRedaction(e, n, o);
    },
    async setRemoteUrl(n) {
      await r.builder_setRemoteUrl(e, n);
    },
    async setNoEmbed(n) {
      await r.builder_setNoEmbed(e, n);
    },
    async setThumbnailFromBlob(n, o) {
      await r.builder_setThumbnailFromBlob(e, n, o);
    },
    async addIngredient(n) {
      const o = JSON.stringify(n);
      await r.builder_addIngredient(e, o);
    },
    async addIngredientFromBlob(n, o, i) {
      const a = JSON.stringify(n);
      await r.builder_addIngredientFromBlob(e, a, o, i);
    },
    async addResourceFromBlob(n, o) {
      await r.builder_addResourceFromBlob(e, n, o);
    },
    async getDefinition() {
      return await r.builder_getDefinition(e);
    },
    async toArchive() {
      return await r.builder_toArchive(e);
    },
    async sign(n, o, i) {
      const a = await E(n), s = t.registerSignReceiver(n.sign);
      return await r.builder_sign(
        e,
        s,
        a,
        o,
        i
      );
    },
    async signAndGetManifestBytes(n, o, i) {
      const a = await E(n), s = t.registerSignReceiver(n.sign);
      return await r.builder_signAndGetManifestBytes(
        e,
        s,
        a,
        o,
        i
      );
    },
    async free() {
      _(), await r.builder_free(e);
    }
  };
}
async function ee(t) {
  const { wasmSrc: e, settings: _ } = t, r = typeof e == "string" ? await Y(e) : e, n = _ ? await u(_) : void 0, o = await k({ wasm: r, settingsString: n });
  return {
    reader: q(o),
    builder: X(o),
    dispose: o.terminate
  };
}
async function Y(t) {
  const e = await fetch(t, { integrity: V });
  return await WebAssembly.compileStreaming(e);
}
export {
  J as READER_SUPPORTED_FORMATS,
  ee as createC2pa,
  p2 as isSupportedReaderFormat
};
