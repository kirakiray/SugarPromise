(function(glo) {
    //common
    //加载中
    var PENDING = 'pending';
    //加载完成
    var FULFILLED = 'fulfilled';
    //加载失败
    var REJECTED = 'rejected';
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

    function SugarPromise() {
        var _this = this;

        //事件寄托对象
        _this._e = new SimpleEvent();

        //函数寄宿对象
        _this._funs = [];

        //总函数数量寄宿属性
        _this._fCou = 0;

        //id递增器
        _this._id = 0;

        //成功数据寄宿对象
        _this.datas = [];

        //错误后数据寄宿对象
        _this.errs = [];

        //是否已经开始跑
        _this._r = 0;

        //后代寄宿对象
        _this._next = [];

        //后代数量寄宿属性
        _this._nCou = 0;

        //hold 是否挂起不执行后代链
        _this._h = 0;
    };
    SugarPromise.prototype = {
        //开始执行的函数
        _run: function() {
            var _this = this;
            _this._r = 1;

            //当完成后执行后代
            _this._e.last(FULFILLED, function() {
                if (_this._next.length) {
                    if (!_this._h) {
                        each(_this._next, function(n) {
                            n._run();
                        });
                    }
                } else {
                    //判断是否有后代，没有后代则直接出发fire事件
                    _this._e.emit(FIRE);
                }
            });

            if (0 in _this._funs) {
                //开始执行内部函数
                each(_this._funs, function(e) {
                    e();
                });
            } else {
                //直接触发运行成功
                _this._e.emit(FULFILLED);
            }

            //回收
            _this._run = _this._funs = null;
        },
        //callPending
        _cp: function(data, state, index) {
            var _this = this;
            var eve = _this._e;
            eve.emit(PENDING, {
                //数据
                data: data,
                //状态
                state: state,
                //序号
                no: index
            });

            //等待call的函数数量为0
            if (!--_this._fCou) {
                //判断执行成功或失败
                if (0 in _this.errs) {
                    eve.emit(REJECTED);
                } else {
                    eve.emit(FULFILLED);
                }

                //回收
                eve.off(PENDING);
                eve.off(REJECTED);
                eve.off(FULFILLED);
                _this.errs = _this.datas = null;
            }
        },
        add: function(fun) {
            var _this = this;

            //添加数据
            _this._fCou++;
            var index = _this._id++;

            //resolve或reject其中只能运行一个
            var iscall = 0;
            var runfun = function() {
                fun.call(_this, function(data) {
                    //resolve
                    if (iscall) return;
                    iscall = 1;

                    //载入数据
                    _this.datas[index] = data;

                    //执行callPending
                    _this._cp(data, FULFILLED, index);
                }, function(data) {
                    //reject
                    if (iscall) return;
                    iscall = 1;

                    _this.errs.push({
                        no: index,
                        data: data
                    });

                    //执行callPending
                    _this._cp(data, REJECTED, index);
                });
            };

            //确认开始了的话就直接开跑
            if (_this._r) {
                runfun();
            } else {
                _this._funs.push(runfun);
            }
        },
        //完成时触发
        then: function(fun) {
            var _this = this;
            _this._e.one(FULFILLED, function(e) {
                //把数据带过去
                fun.apply(_this, _this.datas);
            });
            return _this;
        },
        //拒绝时触发
        "catch": function(fun) {
            var data = this.errs;
            this._e.one(REJECTED, function(e) {
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
            var sp = new SugarPromise();
            each(transToArray(arguments), function(e) {
                sp.add(e);
            });

            var _this = this;

            //增加后代计数
            _this._nCou++;

            //加入后代
            _this._next.push(sp);

            //收集后代的fire
            sp._e.last(FIRE, function() {
                if (!--_this._nCou) {
                    _this._e.emit(FIRE);
                    _this._e = _this._next = null;
                }
            });

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
        },
        //挂起方法
        lock: function() {
            this._h = 1;
        },
        unlock: function() {
            var _this = this;
            //确认是上锁状态
            if (_this._h) {
                _this._h = 0;
                if (!_this.datas) {
                    _this._next && each(_this._next, function(n) {
                        n._run();
                    });
                }
            }
        }
    };
    //main
    var prom = function() {
        var sp = new SugarPromise();
        each(transToArray(arguments), function(e) {
            sp.add(e);
        });
        nextTick(function() {
            sp._run();
        });
        return sp;
    };

    //init
    glo.prom = prom;

    //test
    glo.SimpleEvent = SimpleEvent;
    glo.SugarPromise = SugarPromise;
})(window);