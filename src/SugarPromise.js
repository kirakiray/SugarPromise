(function(glo) {
    //common
    //没开始载入
    var WAIT = 'wait';
    //加载中
    var PENDING = 'pending';
    //加载完成
    var FULFILLED = 'fulfilled';
    //加载失败
    var REJECTED = 'rejected';
    //后代链触发
    var WOOD = "wood";
    //后代链全部触发完成
    var FIRE = 'fire';

    //function
    var emptyFun = function() {};
    //转换成数组
    var transToArray = function(args) {
        return Array.prototype.slice.call(args, 0);
    };
    //遍历
    var each = (function() {
        if ([].forEach) {
            return function(arr, fun) {
                return arr.forEach(fun);
            }
        } else {
            return function(arr, fun) {
                for (var i = 0, len = arr.length; i < len; i++) {
                    fun(arr[i], i);
                };
            };
        }
    })();
    //合并对象
    var extend = function(def, opt) {
        for (var i in opt) {
            def[i] = opt[i];
        }
        return def;
    };
    //改良异步方法
    var nextTick = (function() {
        var isTick = false;
        var nextTickArr = [];
        return function(fun) {
            if (!isTick) {
                isTick = true;
                setTimeout(function() {
                    for (var i = 0; i < nextTickArr.length; i++) {
                        nextTickArr[i]();
                    }
                    nextTickArr = [];
                    isTick = false;
                }, 0);
            }
            nextTickArr.push(fun);
        };
    })();

    //class
    //定制轻量低占内存事件机
    function SimpleEvent() {
        this._eves = {};
    };
    SimpleEvent.fn = SimpleEvent.prototype;
    SimpleEvent.prototype = {
        //获取相应事件对象数据
        _get: function(eventName) {
            return this._eves[eventName] || (this._eves[eventName] = { e: [], o: [] });
        },
        //注册事件
        on: function(eventName, fun) {
            this._get(eventName).e.push(fun);
        },
        //定义一次性事件
        one: function(eventName, fun) {
            this._get(eventName).o.push(fun);
        },
        //定义优先执行函数
        first: function(eventName, fun) {
            this._get(eventName).f = fun;
        },
        //定义最后执行函数
        last: function(eventName, fun) {
            this._get(eventName).l = fun;
        },
        //注销事件
        off: function(eventName) {
            delete this._eves[eventName];
        },
        //触发事件
        emit: function(eventName, data) {
            var eveObj = this._get(eventName);
            //触发first
            var firstFun = eveObj.f;
            firstFun && firstFun({
                name: eventName,
                type: 'first'
            }, data);
            delete eveObj.f;
            //触发事件队列
            var oneArr = eveObj.o;
            while (oneArr.length) {
                oneArr.shift()({
                    name: eventName,
                    type: "one"
                }, data);
            }
            each(eveObj.e, function(e) {
                e({
                    name: eventName,
                    type: "on"
                }, data);
            });
            //触发last
            var lastFun = eveObj.l;
            lastFun && lastFun({
                name: eventName,
                type: 'last'
            }, data);
            delete eveObj.l;
        }
    };

    function SugarPromise(args) {
        var _this = this;
        var eve = _this._e = new SimpleEvent();
        _this.state = WAIT;
        _this.args = args;
        //下一组记录数据
        var _next = _this._next = [];
        //当前组完成后
        eve.last(FULFILLED, function() {
            var fireFun = function() {
                eve.emit(FIRE);
                delete _this.data;
                //判断是否有父级，有则执行引燃WOOD
                if (_this._par) {
                    _this._par._e.emit(WOOD);
                }
                fireFun = null;
            };

            //判断当前是否有后代
            if (!_next.length) {
                //没有后代的话，点火引发FIRE。
                fireFun();
            } else {
                //有后代则后代执行初始化
                each(_next, function(e) {
                    nextTick(function() {
                        e._init();
                    });
                });

                //给有后代的收集
                var woodCount = 0;
                eve.on(WOOD, function(e) {
                    woodCount++;
                    if (_next.length == woodCount) {
                        fireFun();
                        eve.off(WOOD);
                    }
                });
            }
        });
    };
    SugarPromise.prototype = {
        //初始化方法
        _init: function() {
            var _this = this,
                eve = _this._e,
                args = _this.args;
            _this.state = PENDING;
            var argLen = args.length;
            //数据正确的反馈数组
            var argsData = [];
            //数据错误的反馈数组
            var errData;
            if (!argLen) {
                _this.state = FULFILLED;
                eve.emit(FULFILLED, {
                    datas: argsData,
                    state: FULFILLED
                });
                return;
            }

            //pending的方法
            var callPending = function(data, state, index) {
                eve.emit(PENDING, {
                    //数据
                    data: data,
                    //状态
                    state: state,
                    //序号
                    no: index
                });
                argLen--;
                if (!argLen) {
                    //如果是错误状态的话
                    if (errData) {
                        eve.emit(REJECTED, errData);
                    } else {
                        //全部数据加载成功
                        _this.state = FULFILLED;
                        eve.emit(FULFILLED, {
                            datas: argsData,
                            state: FULFILLED
                        });
                    }
                    //垃圾回收
                    callPending = errData = argsData = null;
                    eve.off(PENDING);
                    eve.off(REJECTED);
                    eve.off(FULFILLED);
                }
            };

            each(args, function(e, i) {
                var isCall = false;
                e.call(_this, function(succeedData) {
                    //resolve
                    if (isCall) {
                        return;
                    }
                    //设置数据
                    argsData[i] = succeedData;
                    isCall = true;
                    callPending(succeedData, FULFILLED, i);
                }, function(errorData) {
                    //reject
                    if (isCall) {
                        return;
                    }
                    _this.state = REJECTED;
                    errData = errData || [];
                    errData.push({
                        no: i,
                        data: errorData
                    });
                    isCall = true;
                    callPending(errorData, REJECTED, i);
                });
            });
        },
        //完成时触发
        then: function(fun) {
            var _this = this;
            _this._e.one(FULFILLED, function(e, data) {
                //把数据带过去
                fun.apply(_this, data.datas);
            });
            return _this;
        },
        //拒绝时触发
        "catch": function(fun) {
            this._e.one(REJECTED, function(e, data) {
                fun(data);
            });
            return this;
        },
        //过程中
        pend: function(fun) {
            this._e.on(PENDING, function(e, data) {
                fun(data);
            });
            return this;
        },
        //后续链
        prom: function() {
            var args = transToArray(arguments);
            var sp = new SugarPromise(args);
            //设置parent
            sp._par = this;
            //设置下一批
            this._next.push(sp);
            return sp;
        },
        //传递数据
        send: function(data) {
            this.data = data;
            return this;
        },
        //握手给下一级数据
        gift: function(data) {
            each(this._next, function(e) {
                e.send(data);
            });
        },
        //后代链全部完成
        fire: function(fun) {
            this._e.one(FIRE, fun);
            return this;
        }
    };
    //main
    var prom = function() {
        var args = transToArray(arguments);
        var sp = new SugarPromise(args);
        nextTick(function() {
            sp._init();
        });
        return sp;
    };

    //init
    glo.prom = prom;

    //test
    glo.SimpleEvent = SimpleEvent;
    glo.SugarPromise = SugarPromise;
})(window);