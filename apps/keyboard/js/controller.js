/*
  Controller is in charge of receive interaction events and transform them
  into KeyEvent as well as control interface's update.
*/

'use strict';

const IMEController = (function() {

  function getWindowTop(obj) {
    var top;
    top = obj.offsetTop;
    while (obj = obj.offsetParent) {
      top += obj.offsetTop;
    }
    return top;
  }

  function getWindowLeft(obj) {
    var left;
    left = obj.offsetLeft;
    while (obj = obj.offsetParent) {
      left += obj.offsetLeft;
    }
    return left;
  }

  var BASIC_LAYOUT = -1,
      ALTERNATE_LAYOUT = -2,
      SWITCH_KEYBOARD = -3,
      TOGGLE_CANDIDATE_PANEL = -4;

  var LAYOUT_MODE_DEFAULT = 'Default',
      LAYOUT_MODE_SYMBOLS_I = 'Symbols_1',
      LAYOUT_MODE_SYMBOLS_II = 'Symbols_2';

  // current state of the keyboard
  var _isPressing = null,
      _isWaitingForSecondTap = false,
      _isShowingAlternativesMenu = true,
      _isContinousSpacePressed = false,
      _isWaitingForSpaceSecondTap = false,
      _isUpperCase = false,
      _baseLayoutName = '',
      _currentLayout = null,
      _currentLayoutMode = LAYOUT_MODE_DEFAULT,
      _currentKey = null,
      _currentMenuKey = null,
      _currentInputType = 'text',
      _menuLockedArea = null,
      _lastHeight = 0;

  var _IMEngines = {};
  var _currentEngine = function() {
      return _IMEngines[Keyboards[_baseLayoutName].imEngine];
  };

  // Taps the space key twice within kSpaceDoubleTapTimeoout
  // to produce a "." followed by a space
  var _kSpaceDoubleTapTimeout = 700;

  // show accent char menu (if there is one) after kAccentCharMenuTimeout
  var _kAccentCharMenuTimeout = 700;

  // if user leave the original key and did not move to
  // a key within the accent character menu,
  // after khideAlternativesCharMenuTimeout the menu will be removed.
  var _kHideAlternativesCharMenuTimeout = 500;

  // timeout and interval for delete, they could be cancelled on mouse over
  var _deleteTimeout = 0,
      _deleteInterval = 0,
      _menuTimeout = 0,
      _hideMenuTimeout = 0;

  // backspace repeat delay and repeat rate
  var _kRepeatRate = 100,
      _kRepeatTimeout = 700;

  // Taps the shift key twice within kCapsLockTimeout
  // to lock the keyboard at upper case state.
  var _kCapsLockTimeout = 450,
      _isUpperCaseLocked = false;

  var _severalLanguages = function() {
    return IMEManager.keyboards.length > 1;
  };

  function _mapType(type) {
    switch (type) {
      // basic types
      case 'url':
      case 'tel':
      case 'email':
      case 'text':
        return type;
      break;

      // default fallback and textual types
      case 'password':
      case 'search':
      default:
        return 'text';
      break;

      case 'number':
      case 'range': // XXX: should be different from number
        return 'number';
      break;
    }
  }

  // add some special keys depending on the input's type
  function _addTypeSensitiveKeys(inputType, row, space, where, overwrites) {
    overwrites = overwrites || {};
    switch (inputType) {
      case 'url':
        space.ratio -= 5;
        row.splice(where, 1, // delete space
          { value: '.', ratio: 1, keyCode: 46 },
          { value: '/', ratio: 2, keyCode: 47 },
          { value: '.com', ratio: 2, compositeKey: '.com' }
        );
      break;

      case 'email':
        space.ratio -= 2;
        row.splice(where, 0, { value: '@', ratio: 1, keyCode: 64 });
        row.splice(where + 2, 0, { value: '.', ratio: 1, keyCode: 46 });
      break;

      case 'text':

        var next = where + 1;
        if (overwrites['.'] !== false) {
          space.ratio -= 1;
          next = where + 2;
        }
        if (overwrites[','] !== false)
          space.ratio -= 1;

        if (overwrites[',']) {
          row.splice(where, 0, {
            value: overwrites[','],
            ratio: 1,
            keyCode: overwrites[','].charCodeAt(0)
          });
        } else if (overwrites[','] !== false) {
          row.splice(where, 0, {
            value: ',',
            ratio: 1,
            keyCode: 44
          });
        }

        if (overwrites['.']) {
          row.splice(next, 0, {
            value: overwrites['.'],
            ratio: 1,
            keyCode: overwrites['.'].charCodeAt(0)
          });
        } else if (overwrites['.'] !== false) {
          row.splice(next, 0, {
            value: '.',
            ratio: 1,
            keyCode: 46
          });
        }

      break;
    }

  };

  // mainly, compute the input sensitive row and add it to the layout
  function _buildLayout(baseLayout, inputType, layoutMode) {

    function copy(obj) {
      var newObj = {};
      for (var prop in obj) if (obj.hasOwnProperty(prop)) {
        newObj[prop] = obj[prop];
      }
      return newObj;
    }

    if (inputType === 'number' || inputType === 'tel')
      baseLayout = inputType + 'Layout';

    var layout = Keyboards[_baseLayoutName][baseLayout] || Keyboards[baseLayout];

    // look for keyspace (it behaves as the placeholder for special keys)
    var where = false;
    for (var r = 0, row; !where && (row = layout.keys[r]); r += 1)
      for (var c = 0, space; space = layout.keys[r][c]; c += 1) {
        if (space.keyCode == KeyboardEvent.DOM_VK_SPACE) {
          where = r;
          break;
        }
      }

    // if found, add special keys
    if (where) {

      // we will perform some alchemy here, so preserve...
      layout = copy(layout); // the original space row
      layout.keys = layout.keys.slice(0);
      row = layout.keys[where] = layout.keys[where].slice(0);
      space = copy(space);   // and the original space key
      row[c] = space;

      // switch languages button
      if (IMEManager.keyboards.length > 1 && !layout['hidesSwitchKey']) {
        space.ratio -= 1;
        row.splice(c, 0, {
          value: '&#x1f310;',
          ratio: 1,
          keyCode: SWITCH_KEYBOARD
        });
        c += 1;
      }

      // Alternate layout key
      // This gives the author the ability to change the alternate layout
      // key contents
      var alternateLayoutKey = '?123';
      if (layout['alternateLayoutKey']) {
        alternateLayoutKey = layout['alternateLayoutKey'];
      }

      // This gives the author the ability to change the basic layout
      // key contents
      var basicLayoutKey = 'ABC';
      if (layout['basicLayoutKey']) {
        basicLayoutKey = layout['basicLayoutKey'];
      }

      if (!layout['disableAlternateLayout']) {
        space.ratio -= 2;
        if (_currentLayoutMode === LAYOUT_MODE_DEFAULT) {
          row.splice(c, 0, {
            keyCode: ALTERNATE_LAYOUT,
            value: alternateLayoutKey,
            ratio: 2
          });

        } else {
          row.splice(c, 0, {
            keyCode: BASIC_LAYOUT,
            value: basicLayoutKey,
            ratio: 2
          });
        }
        c += 1;
      }

      // Text types specific keys
      var spliceArgs;
      if (!layout['typeInsensitive']) {
        _addTypeSensitiveKeys(
          inputType,
          row,
          space,
          c,
          layout.textLayoutOverwrite
        );
      }

    } else {
      console.warn('No space key found. No special keys will be added.');
    }

    return layout;
  }

  // recompute the layout to display
  function _handleSymbolLayoutRequest(keycode) {
    var base;

    // request for SYMBOLS (page 1)
    if (keycode === ALTERNATE_LAYOUT) {
      _currentLayoutMode = LAYOUT_MODE_SYMBOLS_I;
      base = 'alternateLayout';

    // altern between pages 1 and 2 of SYMBOLS
    } else if (keycode === KeyEvent.DOM_VK_ALT) {

      if (_currentLayoutMode === LAYOUT_MODE_SYMBOLS_I) {
        _currentLayoutMode = LAYOUT_MODE_SYMBOLS_II;
        base = 'symbolLayout';

      } else {
        _currentLayoutMode = LAYOUT_MODE_SYMBOLS_I;
        base = 'alternateLayout';
      }

    // request for ABC
    } else {
      _currentLayoutMode = LAYOUT_MODE_DEFAULT;
      base = _baseLayoutName;
    }

    _draw(base, _currentInputType, _currentLayoutMode);
  }

  function _updateTargetWindowHeight() {
    var height;
    if (IMERender.ime.dataset.hidden) {
      height = 0;
    } else {
      height = IMERender.ime.scrollHeight;
    }

    var message = {
      action: 'updateHeight',
      keyboardHeight: height,
      hidden: !!IMERender.ime.dataset.hidden
    };

    parent.postMessage(JSON.stringify(message), '*');
  }

  var _dimensionsObserver = new MutationObserver(_updateTargetWindowHeight);
  var _dimensionsObserverConfig = {
    childList: true, // to detect changes in IMEngine
    attributes: true, attributeFilter: ['class', 'style', 'data-hidden']
  };

  // sends a delete code to remove last character
  function _sendDelete(feedback) {
    if (feedback)
      IMEFeedback.triggerFeedback();
    if (Keyboards[_baseLayoutName].type == 'ime' &&
        _currentLayoutMode === LAYOUT_MODE_DEFAULT) {
      _currentEngine().click(KeyboardEvent.DOM_VK_BACK_SPACE);
      return;
    }
    window.navigator.mozKeyboard.sendKey(KeyboardEvent.DOM_VK_BACK_SPACE, 0);
  };

  function _highlightKey(target) {
    IMERender.highlightKey(target);
  }

  // given a key object, return the upper value taking in count
  // if it is a special key of it has been overwrote
  function _getUpperCaseValue(key) {
    var specialCodes = [
      KeyEvent.DOM_VK_BACK_SPACE,
      KeyEvent.DOM_VK_CAPS_LOCK,
      KeyEvent.DOM_VK_RETURN,
      KeyEvent.DOM_VK_ALT,
      KeyEvent.DOM_VK_SPACE
    ];
    var hasSpecialCode = specialCodes.indexOf(key.keyCode) > -1;
    if (key.keyCode < 0 || hasSpecialCode || key.compositeKey)
      return key.value;

    var upperCase = _currentLayout.upperCase || {};
    var v = upperCase[key.value] || key.value.toUpperCase();
    return v;
  }

  function _showAlternatives(key) {
    var alternatives, altMap, value, keyObj, uppercaseValue;
    var r = key ? key.dataset.row : -1, c = key ? key.dataset.column : -1;
    if (r < 0 || c < 0)
      return;

    // get alternatives from layout
    altMap = _currentLayout.alt || {};
    keyObj = _currentLayout.keys[r][c];
    value = keyObj.value;
    alternatives = altMap[value] || '';

    // in uppercase, look for other alternatives or use default's
    if (_isUpperCase) {
      uppercaseValue = _getUpperCaseValue(keyObj);
      alternatives = altMap[uppercaseValue] || alternatives.toUpperCase();
    }

    if (alternatives.indexOf(' ') != -1) {
      alternatives = alternatives.split(' ');
      // check just one item
      if (alternatives.length === 2 && alternatives[1] === '')
        alternatives.pop();
    } else {
      alternatives = alternatives.split('');
    }

    if (!alternatives.length)
      return;

    IMERender.showAlternativesCharMenu(key, alternatives);
    _isShowingAlternativesMenu = true;
    _currentMenuKey = key;

    // Locked limits
    _menuLockedArea = {
      top: getWindowTop(_currentMenuKey),
      bottom: getWindowTop(_currentMenuKey) + _currentMenuKey.scrollHeight,
      left: getWindowLeft(IMERender.menu),
      right: getWindowLeft(IMERender.menu) + IMERender.menu.scrollWidth
    };
    _menuLockedArea.width = _menuLockedArea.right - _menuLockedArea.left;
    _menuLockedArea.ratio =
      _menuLockedArea.width / IMERender.menu.children.length;
  }

  function _hideAlternatives() {
    IMERender.hideAlternativesCharMenu();
    if (_currentMenuKey)
      IMERender.unHighlightKey(_currentMenuKey);
    _isShowingAlternativesMenu = false;
  }

  function _isNormalKey(key) {
    var keyCode = parseInt(key.dataset.keycode);
    return keyCode || key.dataset.selection || key.dataset.compositekey;
  }

  //
  // EVENTS HANDLERS
  //

  function _onMouseDown(evt) {
    var keyCode;

    _isPressing = true;
    _currentKey = evt.target;
    if (!_isNormalKey(_currentKey))
      return;
    keyCode = parseInt(_currentKey.dataset.keycode);

    // Feedback
    _highlightKey(_currentKey);
    IMEFeedback.triggerFeedback();

    // Per key alternatives
    _menuTimeout = window.setTimeout((function menuTimeout() {
      _showAlternatives(_currentKey);
    }), _kAccentCharMenuTimeout);

    // Special key: delete
    if (keyCode === KeyEvent.DOM_VK_BACK_SPACE) {

      // First, just pressing (without feedback)
      _sendDelete(false);

      // Second, after a delay (with feedback)
      _deleteTimeout = window.setTimeout(function() {
        _sendDelete(true);

        // Third, after shorter delay (with feedback too)
        _deleteInterval = setInterval(function() {
          _sendDelete(true);
        }, _kRepeatRate);

      }, _kRepeatTimeout);

    }
  }

  function _onMouseMove(evt) {
    var altCount, width, menuChildren;

    // Control locked zone for menu
    if (_isShowingAlternativesMenu &&
        _menuLockedArea &&
        evt.screenY >= _menuLockedArea.top &&
        evt.screenY <= _menuLockedArea.bottom &&
        evt.screenX >= _menuLockedArea.left &&
        evt.screenX <= _menuLockedArea.right) {

      clearTimeout(_hideMenuTimeout);
      menuChildren = IMERender.menu.children;

      var event = document.createEvent('MouseEvent');
      event.initMouseEvent(
        'mouseover', true, true, window, 0,
        0, 0, 0, 0,
        false, false, false, false, 0, null
      );

      menuChildren[Math.floor(
        (evt.screenX - _menuLockedArea.left) / _menuLockedArea.ratio
      )].dispatchEvent(event);
      return;
    }

  }

  function _onMouseOver(evt) {
    var target = evt.target;
    var keyCode = parseInt(target.dataset.keycode);

    // do nothing if no pressing (mouse events) or same key
    if (!_isPressing || _currentKey == target)
      return;

    // do nothing if no keycode
    if (!_isNormalKey(target))
      return;

    // remove current highlight
    if (!(_isShowingAlternativesMenu && _currentKey === _currentMenuKey))
      IMERender.unHighlightKey(_currentKey);

    // ignore if moving over del key
    if (keyCode == KeyEvent.DOM_VK_BACK_SPACE) {
      _currentKey = null;
      return;
    }

    _highlightKey(target);
    _currentKey = target;

    // reset imminent menus or actions
    clearTimeout(_deleteTimeout);
    clearInterval(_deleteInterval);
    clearTimeout(_menuTimeout);

    // control hide of alternatives menu
    if (target.parentNode === IMERender.menu) {
      clearTimeout(_hideMenuTimeout);
    } else {
      clearTimeout(_hideMenuTimeout);
      _hideMenuTimeout = window.setTimeout(
        function hideMenuTimeout() {
          _hideAlternatives();
        },
        _kHideAlternativesCharMenuTimeout
      );
    }

    // control showing alternatives menu
    _menuTimeout = window.setTimeout((function menuTimeout() {
      _showAlternatives(target);
    }), _kAccentCharMenuTimeout);

  }

  function _onScroll(evt) {
    if (!_isPressing || !_currentKey)
      return;

    _onMouseLeave(evt);
    _isPressing = false; // cancel the following mouseover event
  }

  function _onMouseLeave(evt) {
    if (!_isPressing || !_currentKey)
      return;

    IMERender.unHighlightKey(_currentKey);
    _hideMenuTimeout = window.setTimeout(function hideMenuTimeout() {
        _hideAlternatives();
    }, _kHideAlternativesCharMenuTimeout);

    _currentKey = null;
  }

  function _onMouseUp(evt) {
    _isPressing = false;

    if (!_currentKey)
      return;

    clearTimeout(_deleteTimeout);
    clearInterval(_deleteInterval);
    clearTimeout(_menuTimeout);

    _hideAlternatives();

    var target = _currentKey;
    var keyCode = parseInt(target.dataset.keycode);
    if (!_isNormalKey(target))
      return;

    // IME candidate selected
    var dataset = target.dataset;
    if (dataset.selection) {
      _currentEngine().select(target.textContent, dataset.data);
      _highlightKey(target);
      _currentKey = null;
      return;
    }

    IMERender.unHighlightKey(target);
    _currentKey = null;

    if (keyCode == KeyEvent.DOM_VK_BACK_SPACE)
      return;

    // Reset the flag when a non-space key is pressed,
    // used in space key double tap handling
    if (keyCode != KeyEvent.DOM_VK_SPACE)
      _isContinousSpacePressed = false;

    // Handle composite key
    var sendCompositeKey = function sendCompositeKey(compositeKey) {
        compositeKey.split('').forEach(function sendEachKey(key) {
          window.navigator.mozKeyboard.sendKey(0, key.charCodeAt(0));
        });
    }

    var compositeKey = target.dataset.compositekey;
    if (compositeKey) {
      sendCompositeKey(compositeKey);
      return;
    }

    // Handle normal key
    switch (keyCode) {
      case BASIC_LAYOUT:
      case ALTERNATE_LAYOUT:
      case KeyEvent.DOM_VK_ALT:
        _handleSymbolLayoutRequest(keyCode);
      break;

      case SWITCH_KEYBOARD:

        // If the user has specify a keyboard in the menu,
        // switch to that keyboard.
        var language = target.dataset.keyboard ?
          target.dataset.keyboard :
          _baseLayoutName;

        var keyboards = IMEManager.keyboards;
        var index = keyboards.indexOf(language);
        index = (index + 1) % keyboards.length;
        _baseLayoutName = IMEManager.keyboards[index];

        _currentLayoutMode = LAYOUT_MODE_DEFAULT;
        _isUpperCase = false;
        _draw(
          _baseLayoutName, _currentInputType,
          _currentLayoutMode, _isUpperCase
        );

        if (Keyboards[_baseLayoutName].type == 'ime') {
          if (_currentEngine().show) {
            _currentEngine().show(_currentInputType);
          }
        }

        break;

      case TOGGLE_CANDIDATE_PANEL:
        if (IMERender.ime.classList.contains('candidate-panel')) {
          IMERender.ime.classList.remove('candidate-panel');
          IMERender.ime.classList.add('full-candidate-panel');
        } else {
          IMERender.ime.classList.add('candidate-panel');
          IMERender.ime.classList.remove('full-candidate-panel');
        }
        break;

      case KeyEvent.DOM_VK_CAPS_LOCK:

        // lock caps
        if (_isWaitingForSecondTap) {
          _isWaitingForSecondTap = false;

          _isUpperCase = _isUpperCaseLocked = true;
          _draw(
            _baseLayoutName, _currentInputType,
            _currentLayoutMode, _isUpperCase
          );

        // normal behavior: set timeut for second tap and toggle caps
        } else {

          // timout for second tap
          _isWaitingForSecondTap = true;
          window.setTimeout(
            function() {
              _isWaitingForSecondTap = false;
            },
            _kCapsLockTimeout
          );

          // toggle caps
          _isUpperCase = !_isUpperCase;
          _isUpperCaseLocked = false;
          _draw(
            _baseLayoutName, _currentInputType,
            _currentLayoutMode, _isUpperCase
          );
        }

        // keyboard updated: all buttons recreated so event target is lost.
        var capsLockKey = document.querySelector(
          'button[data-keycode="'+KeyboardEvent.DOM_VK_CAPS_LOCK+'"]'
        );
        IMERender.setUpperCaseLock(
          capsLockKey,
          _isUpperCaseLocked ? 'locked' : _isUpperCase
        );

        break;

      case KeyEvent.DOM_VK_RETURN:
        if (Keyboards[_baseLayoutName].type == 'ime' &&
            _currentLayoutMode === LAYOUT_MODE_DEFAULT) {
          _currentEngine().click(keyCode);
          break;
        }

        window.navigator.mozKeyboard.sendKey(keyCode, 0);
        break;

      // To handle the case when double tapping the space key
      case KeyEvent.DOM_VK_SPACE:
        if (_isWaitingForSpaceSecondTap &&
            !_isContinousSpacePressed) {

          if (Keyboards[_baseLayoutName].type == 'ime' &&
            _currentLayoutMode === LAYOUT_MODE_DEFAULT) {

            //TODO: need to define the inteface for double tap handling
            //_currentEngine().doubleTap(keyCode);
            break;
          }

          // Send a delete key to remove the previous space sent
          window.navigator.mozKeyboard.sendKey(KeyEvent.DOM_VK_BACK_SPACE,
                                               0);

          // Send the . symbol followed by a space
          window.navigator.mozKeyboard.sendKey(0, 46);
          window.navigator.mozKeyboard.sendKey(0, keyCode);

          _isWaitingForSpaceSecondTap = false;

          // a flag to prevent continous replacement of space with "."
          _isContinousSpacePressed = true;
          break;
        }

        _isWaitingForSpaceSecondTap = true;

        window.setTimeout(
          (function removeSpaceDoubleTapTimeout() {
            _isWaitingForSpaceSecondTap = false;
          }).bind(this),
          _kSpaceDoubleTapTimeout
        );

        _handleMouseDownEvent(keyCode);
        break;

      default:
        _handleMouseDownEvent(keyCode);
        break;

    }
  }

  // when attached as event listeners, this will be bound to current this object
  // you can add a closure to add support methods
  var _imeEvents = {
    'mousedown': _onMouseDown,
    'mouseover': _onMouseOver,
    'mouseleave': _onMouseLeave,
    'mouseup': _onMouseUp,
    'mousemove': _onMouseMove
  };

  function _reset() {
    // TODO: _baseLayoutName is only set by IMEManager (it should not be mine)
    _currentLayoutMode = LAYOUT_MODE_DEFAULT;
    _isUpperCase = false;
  }

  function _init() {
    IMERender.init();
    for (var event in _imeEvents) {
      var callback = _imeEvents[event] || null;
      if (callback)
        IMERender.ime.addEventListener(event, callback.bind(this));
    }
    _dimensionsObserver.observe(IMERender.ime, _dimensionsObserverConfig);
  }

  function _uninit() {
    _dimensionsObserver.disconnect();
    for (event in _imeEvents) {
      var callback = _imeEvents[event] || null;
      if (callback)
        IMERender.ime.removeEventListener(event, callback.bind(this));
    }
    // XXX: Not yet implemented
    // IMERender.uninit();

    for (var engine in this.IMEngines) {
      if (this.IMEngines[engine].uninit)
        this.IMEngines[engine].uninit();
      delete this.IMEngines[engine];
    }
  }

  function _draw(baseLayout, inputType, layoutMode, uppercase) {
    baseLayout = baseLayout || _baseLayoutName;
    inputType = inputType || _currentInputType;
    layoutMode = layoutMode || _currentLayout;
    uppercase = uppercase || false;

    _currentLayout = _buildLayout(baseLayout, inputType, layoutMode);

    if (_severalLanguages())
      IMERender.draw(
        _currentLayout, baseLayout,
        _onScroll,
        {uppercase: uppercase, getUpperCaseValue: _getUpperCaseValue}
      );
    else
      IMERender.draw(
        _currentLayout, undefined,
        _onScroll,
        {uppercase: uppercase, getUpperCaseValue: _getUpperCaseValue}
      );
  }

  function _handleMouseDownEvent(keyCode) {
    if (Keyboards[_baseLayoutName].type == 'ime' &&
        _currentLayoutMode == LAYOUT_MODE_DEFAULT) {

      _currentEngine().click(keyCode);
      return;
    }

    window.navigator.mozKeyboard.sendKey(0, keyCode);

    if (_isUpperCase &&
        !_isUpperCaseLocked && _currentLayoutMode === LAYOUT_MODE_DEFAULT) {

      _isUpperCase = false;
      _draw(
        _baseLayoutName, _currentInputType,
        _currentLayoutMode, _isUpperCase
      );
    }
  }

  return {
    // IME Engines are self registering here.
    get IMEngines() { return _IMEngines; },

    get currentKeyboard() { return _baseLayoutName; },
    set currentKeyboard(value) { _baseLayoutName = value; },

    init: _init,
    uninit: _uninit,

    showIME: function(type) {
      delete IMERender.ime.dataset.hidden;
      IMERender.ime.classList.remove('hide');

      _currentInputType = _mapType(type);
      _draw(
        _baseLayoutName, _currentInputType,
        _currentLayoutMode, _isUpperCase
      );

      if (Keyboards[_baseLayoutName].type == 'ime') {
        if (_currentEngine().show) {
          _currentEngine().show(type);
        }
      }
    },

    hideIME: function km_hideIME(imminent) {
      IMERender.ime.classList.add('hide');
      IMERender.hideIME(imminent);
    },

    onResize: function(nWidth, nHeight, fWidth, fHeihgt) {
      if (IMERender.ime.dataset.hidden)
        return;

      IMERender.resizeUI();
      _updateTargetWindowHeight();
    },

    loadKeyboard: function km_loadKeyboard(name) {
      var keyboard = Keyboards[name];
      if (keyboard.type !== 'ime')
        return;

      var sourceDir = './js/imes/';
      var imEngine = keyboard.imEngine;

      // Same IME Engine could be load by multiple keyboard layouts
      // keep track of it by adding a placeholder to the registration point
      if (this.IMEngines[imEngine])
        return;

      this.IMEngines[imEngine] = {};

      var script = document.createElement('script');
      script.src = sourceDir + imEngine + '/' + imEngine + '.js';
      var glue = {
        path: sourceDir + imEngine,
        sendCandidates: function(candidates) {
          IMERender.showCandidates(candidates);
        },
        sendPendingSymbols: function(symbols) {
          IMERender.showPendingSymbols(symbols);
        },
        sendKey: function(keyCode) {
          switch (keyCode) {
            case KeyEvent.DOM_VK_BACK_SPACE:
            case KeyEvent.DOM_VK_RETURN:
              window.navigator.mozKeyboard.sendKey(keyCode, 0);
              break;

            default:
              window.navigator.mozKeyboard.sendKey(0, keyCode);
              break;
          }
        },
        sendString: function(str) {
          for (var i = 0; i < str.length; i++)
            this.sendKey(str.charCodeAt(i));
        },
        alterKeyboard: function(keyboard) {
          _draw(keyboard, _currentInputType, _currentLayoutMode, _isUpperCase);
        }
      };

      script.addEventListener('load', (function IMEnginesLoaded() {
        var engine = this.IMEngines[imEngine];
        engine.init(glue);
      }).bind(this));

      document.body.appendChild(script);
    }

  };
})();
