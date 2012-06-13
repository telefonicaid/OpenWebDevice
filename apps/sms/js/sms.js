/* -*- Mode: Java; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- /
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

'use strict';

var MessageManager = {
  getMessages: function mm_getMessages(callback, filter, invert) {
    var request = navigator.mozSms.getMessages(filter, !invert);

    var messages = [];
    request.onsuccess = function onsuccess() {
      var cursor = request.result;
      if (!cursor.message) {
        callback(messages);
        return;
      }

      messages.push(cursor.message);
      cursor.continue();
    };

    request.onerror = function onerror() {
      var msg = 'Error reading the database. Error: ' + request.errorCode;
      console.log(msg);
    };
  },

  send: function mm_send(number, text, callback) {
    var req = navigator.mozSms.send(number, text);
    req.onsuccess = function onsuccess() {
      callback(req.result);
    };

    req.onerror = function onerror() {
      callback(null);
    };
  },

  deleteMessage: function mm_deleteMessage(id, callback) {
    var req = navigator.mozSms.delete(id);
    req.onsuccess = function onsuccess() {
      callback(req.result);
    };

    req.onerror = function onerror() {
      var msg = 'Message deleting error in the database. Error: ' + req.errorCode;
      console.log(msg);
      callback(null);
    };
  },

  /*
    TODO: If the messages could not be deleted completely,
    conversation list page will also update withot notification currently.
    May need more infomation for user that the messages were not
    removed completely.
  */
  deleteMessages: function mm_deleteMessages(list, callback) {
    if (list.length > 0) {
      this.deleteMessage(list.shift(), function(result) {
        this.deleteMessages(list, callback);
      }.bind(this));
    } else
      callback();
  }
};


var ConversationListView = {
  get view() {
    delete this.view;
    return this.view = document.getElementById('msg-conversations-list');
  },

  get searchInput() {
    delete this.searchInput;
    return this.searchInput = document.getElementById('msg-search');
  },

  get deleteButton() {
    delete this.deleteButton;
    return this.deleteButton = document.getElementById('msg-delete-button');
  },

  get deleteAllButton() {
    delete this.deleteAllButton;
    return this.deleteAllButton = document.getElementById('msg-delete-all-button');

  },

  get cancelDialogButton() {
    delete this.cancelDialogButton;
    return this.cancelDialogButton = document.getElementById('msg-cancel-button');
  },

  get acceptDialogButton() {
    delete this.acceptDialogButton;
    return this.acceptDialogButton = document.getElementById('msg-accept-button');

  },

  init: function cl_init() {
    this.delNumList = [];
    if (navigator.mozSms)
      navigator.mozSms.addEventListener('received', this);

    this.searchInput.addEventListener('keyup', this);
    this.searchInput.addEventListener('blur', this);
    this.deleteButton.addEventListener('mousedown', this);
    this.deleteAllButton.addEventListener('mousedown', this);

    this.cancelDialogButton.addEventListener('mousedown', this);
    this.acceptDialogButton.addEventListener('mousedown', this);

    this.view.addEventListener('click', this);
    window.addEventListener('hashchange', this);
    this.updateConversationList();
  },

  updateConversationList: function cl_updateCL(pendingMsg) {
    var self = this;
    /*
      TODO: Conversation list is always order by contact family names
      not the timestamp.
      It should be timestamp in normal view, and order by name while searching
    */
    MessageManager.getMessages(function getMessagesCallback(messages) {
      if (pendingMsg &&
          (!messages[0] || messages[0].id !== pendingMsg.id))
        messages.unshift(pendingMsg);

      var conversations = {};
      var request = window.navigator.mozContacts.find({});
      request.onsuccess = function findCallback() {
        var contacts = request.result;

        contacts.sort(function contactsSort(a, b) {
          return a.familyName[0].toUpperCase() > b.familyName[0].toUpperCase();
        });

        contacts.forEach(function(contact, i) {
          var num = contact.tel.length ? contact.tel[0].number : null;
          conversations[num] = {
            'hidden': true,
            'name': contact.name[0],
            'num': num,
            'body': '',
            'timestamp': '',
            'id': parseInt(i)
          };
        });

        for (var i = 0; i < messages.length; i++) {
          var message = messages[i];

          // XXX why does this happen?
          if (!message.delivery)
            continue;

          var num = message.delivery == 'received' ?
                    message.sender : message.receiver;

          var conversation = conversations[num];
          if (conversation && !conversation.hidden)
            continue;

          if (!conversation) {
            conversations[num] = {
              'hidden': false,
              'body': message.body,
              'name': num,
              'num': num,
              'timestamp': message.timestamp.getTime(),
              'id': i
            };
          } else {
            conversation.hidden = false;
            conversation.timestamp = message.timestamp.getTime();
            conversation.body = message.body;
          }
        }

        var fragment = '';
        /*
          Order by conversation timestamp not by the contact name.
          We want new conversations in the top.
        */
        var orderedConversations = [];
        for (var num in conversations) {
          /*
            Push an array containing [timestap, conversation]
            so we can order the list by timestap.
          */
          orderedConversations.push([conversations[num].timestamp,
                                    conversations[num]]);
        }
        orderedConversations.sort(function(a,b) {
          return b[0] - a[0];
        });
        //Now we have the ordered conversations
        var conversation;
        for (var i in orderedConversations) {
          conversation = orderedConversations[i][1];
          if (self.delNumList.indexOf(conversation.num) > -1) {
            continue;
          }

          //Add a grouping header if neccessary
          var header = self.createNewHeader(conversation);
          if (header != null) {
            fragment += header;
          }
          fragment += self.createNewConversation(conversation);
        }
        self.view.innerHTML = fragment;
        if (self.delNumList.length > 0) {
          self.showUndoToolbar();
        }
      };
    }, null);
  },

  //Adds a new grouping header if necesary (today, tomorrow, ...)
  createNewHeader: function cl_createNewHeader(conversation) {
    function sameDay(ts1, ts2) {
      var d1, d2;
      d1 = new Date(ts1);
      d2 = new Date(ts2);

      return d1.getFullYear() == d2.getFullYear() &&
        d1.getMonth() == d2.getMonth() &&
        d1.getDate() == d2.getDate();
    };

    if (this._lastHeader && sameDay(this._lastHeader, conversation.timestamp)) {
      return null;
    }

    this._lastHeader = conversation.timestamp;

    var now = new Date();
    //Build the today date starting a 00:00:00
    var today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    var diff = today.getTime() - conversation.timestamp;
    var aDay = 1000 * 60 * 60 * 24; //Miliseconds for a day

    var content;
    if (diff <= 0) {
      //Show today
      content = 'TODAY'; //TODO: Localise
    } else if (diff > 0 && diff < aDay * 2) {
      //Show yesterday
      content = 'YESTERDAY'; //TODO: Localise
    } else if (diff < 4 * aDay) {
      //Show the day of the week
      var d = ['Sunday', 'Monday', 'Tuesday', 'Wednesday',
      'Thursday', 'Friday', 'Saturday'];
      //TODO: Localise
      content = d[new Date(conversation.timestamp).getDay()];
    } else {
      //Show the date
      var d = new Date(conversation.timestamp);
      //TODO: Localise
      return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate();
    }

    return '<div class="groupHeader">' + content + '</div>';

  },

  createNewConversation: function cl_createNewConversation(conversation) {
    return '<a href="#num=' + conversation.num + '"' + ' data-num="' + conversation.num + '"' +
           ' data-name="' + escapeHTML(conversation.name || conversation.num, true) + '"' +
           ' data-notempty="' + (conversation.timestamp ? 'true' : '') + '"' +
           ' class="' + (conversation.hidden ? 'hide' : '') + '">' +
           '  <input type="checkbox" class="fake-checkbox"/>' + '<span></span>' +
           '  <div class="name">' + escapeHTML(conversation.name) + '</div>' +
           '  <div class="msg">' + escapeHTML(conversation.body.split('\n')[0]) + '</div>' +
           (conversation.timestamp ?
             '  <div class="time" data-time="' + conversation.timestamp + '">' +
                 prettyDate(conversation.timestamp) + '</div>' : '') +
           '</a>';
  },

  searchConversations: function cl_searchConversations() {
    var conversations = this.view.children;

    var str = this.searchInput.value;
    if (!str) {
      // leaving search view
      for (var i = 0; i < conversations.length; i++) {
        var conversation = conversations[i];
        if (conversation.dataset.notempty === 'true') {
          conversation.classList.remove('hide');
        } else {
          conversation.classList.add('hide');
        }
      }
      return;
    }

    var reg = new RegExp(str, 'i');

    for (var i = 0; i < conversations.length; i++) {
      var conversation = conversations[i];
    try {
      var dataset = conversation.dataset;
      if (!reg.test(dataset.num) && !reg.test(dataset.name)) {
        conversation.classList.add('hide');
      } else {
        conversation.classList.remove('hide');
      }
  } catch (e) {
      alert(conversation);
  }
    }
  },

  openConversationView: function cl_openConversationView(num) {
    if (!num)
      return;

    window.location.hash = '#num=' + num;
  },

  handleEvent: function cl_handleEvent(evt) {
    switch (evt.type) {
      case 'received':
        ConversationListView.updateConversationList(evt.message);
        break;

      case 'keyup':
        this.searchConversations();
        break;

      case 'blur':
        window.location.hash = '#';
        break;

      case 'hashchange':
        this.toggleEditMode(window.location.hash == '#edit');
        this.toggleSearchMode(window.location.hash == '#search');
        if (window.location.hash) {
          return;
        }
        document.body.classList.remove('conversation');
        document.body.classList.remove('conversation-new-msg');
        break;

      case 'mousedown':
        switch (evt.currentTarget) {
          case this.deleteButton:
            this.executeMessageDelete();
            break;
          case this.deleteAllButton:
            this.showConfirmationDialog();
            break;
          case this.acceptDialogButton:
            this.executeAllMessagesDelete();
            break;
          case this.cancelDialogButton:
            this.hideConfirmationDialog();
            break;
        }
        break;

      case 'click':
        // When Event listening target is this.view and clicked target has a fake-input child.
        if (evt.currentTarget == this.view && evt.target.href) { 
          this.onListItemClicked(evt);
        }
        break;
    }
  },


  executeMessageDelete: function cl_executeMessageDelete() {
    this.deleteMessages(this.delNumList);
    this.delNumList = [];
  },

  executeAllMessagesDelete: function cl_executeAllMessagesDelete() {
    // Clean current list in case messages checked
    this.delNumList = [];

    var inputElements_list = document.getElementById('msg-conversations-list').getElementsByTagName('a');
    for (var i = 0; i < inputElements_list.length; i++) {
      this.delNumList.push(inputElements_list[i].dataset.num);
    }

    this.executeMessageDelete();
    this.hideConfirmationDialog();
  },

  showConfirmationDialog: function cl_showConfirmationDialog() {
    var bodyclassList = document.body.classList;
    bodyclassList.add('msg-confirmation-pending');
  },

  hideConfirmationDialog: function cl_hideConfirmationDialog() {
    var bodyclassList = document.body.classList;
    bodyclassList.remove('msg-confirmation-pending');
  },

  deleteMessages: function cl_deleteMessages(numberList) {
    if (numberList == undefined || numberList.length == 0)
      return;

    var filter = new MozSmsFilter();
    filter.numbers = numberList;

    MessageManager.getMessages(function mm_getMessages(messages) {
      var msgs = [];
      for (var i = 0; i < messages.length; i++) {
        msgs.push(messages[i].id);
      }
      MessageManager.deleteMessages(msgs, this.updateConversationList.bind(this));
    }.bind(this), filter);

    window.location.hash = '#';
  },

  toggleSearchMode: function cl_toggleSearchMode(show) {
    if (show) {
      document.body.classList.add('msg-search-mode');
    } else {
      document.body.classList.remove('msg-search-mode');
    }
  },

  toggleEditMode: function cl_toggleEditMode(show) {
    if (show) {      
      document.body.classList.add('edit-mode');  
    } else {
      document.body.classList.remove('edit-mode');
    }
  },

  onListItemClicked: function cl_onListItemClicked(evt) {
    var cb = evt.target.getElementsByClassName('fake-checkbox')[0];
    if (!cb){
      return;
    }

    if (!document.body.classList.contains('edit-mode')){
      return;
    }

    evt.preventDefault();
    cb.checked = !cb.checked;
    if (cb.checked) {
      this.delNumList.push(evt.target.dataset.num);
    } else {
      this.delNumList.splice(this.delNumList.indexOf(evt.target.dataset.num), 1);
    }
  }
};

var ConversationView = {
  get view() {
    delete this.view;
    return this.view = document.getElementById('view-list');
  },

  get num() {
    delete this.number;
    return this.number = document.getElementById('view-num');
  },

  get title() {
    delete this.title;
    return this.title = document.getElementById('view-name');
  },

  get input() {
    delete this.input;
    return this.input = document.getElementById('view-msg-text');
  },
  
  get doneButton() {
      delete this.doneButton;
      return this.doneButton = document.getElementById('view-done-button');
  },

  get deleteButton() {
    delete this.deleteButton;
    return this.deleteButton = document.getElementById('view-delete-button');
  },

  get deleteAllButton() {
    delete this.deleteAllButton;
    return this.deleteAllButton = document.getElementById('view-delete-all-button');

  },

  get cancelDialogButton() {
    delete this.cancelDialogButton;
    return this.cancelDialogButton = document.getElementById('view-cancel-button');
  },

  get acceptDialogButton() {
    delete this.acceptDialogButton;
    return this.acceptDialogButton = document.getElementById('view-accept-button');
  },
  
  get sendButton() {
      delete this.sendButton;
      return this.sendButton = document.getElementById('view-msg-send');
  },

  init: function cv_init() {
    this.delNumList = [];
    
    if (navigator.mozSms)
      navigator.mozSms.addEventListener('received', this);

    // click event does not trigger when keyboard is hiding
    this.sendButton.addEventListener('mousedown', this.sendMessage.bind(this));
      
    this.doneButton.addEventListener('mousedown', this);
    this.deleteButton.addEventListener('mousedown', this);
    this.deleteAllButton.addEventListener('mousedown', this);
    this.acceptDialogButton.addEventListener('mousedown', this);
    this.cancelDialogButton.addEventListener('mousedown', this);

    this.input.addEventListener('input', this.updateInputHeight.bind(this));
    this.view.addEventListener('click', this);
 
    var windowEvents = ['resize', 'keyup', 'transitionend', 'hashchange'];
    windowEvents.forEach((function(eventName) {
      window.addEventListener(eventName, this);
    }).bind(this));


    var num = this.getNumFromHash();
    if (num)
      this.showConversation(num);
  },

  getNumFromHash: function cv_getNumFromHash() {
    return (/\bnum=(.+)(&|$)/.exec(window.location.hash) || [])[1];
  },

  scrollViewToBottom: function cv_scrollViewToBottom(animateFromPos) {
    if (!animateFromPos) {
      this.view.scrollTop = this.view.scrollHeight;
      return;
    }

    clearInterval(this.viewScrollingTimer);
    this.view.scrollTop = animateFromPos;
    this.viewScrollingTimer = setInterval((function scrollStep() {
      var view = this.view;
      var height = view.scrollHeight - view.offsetHeight;
      if (view.scrollTop === height) {
        clearInterval(this.viewScrollingTimer);
        return;
      }
      view.scrollTop += Math.ceil((height - view.scrollTop) / 2);
    }).bind(this), 100);

  },

  updateInputHeight: function cv_updateInputHeight() {
    var input = this.input;
    input.style.height = null;
    input.style.height = input.scrollHeight + 8 + 'px';

    var newHeight = input.getBoundingClientRect().height;
    var bottomToolbarHeight = (newHeight + 32) + 'px';
    var bottomToolbar =
      document.getElementById('view-bottom-toolbar');

    bottomToolbar.style.height = bottomToolbarHeight;

    this.view.style.bottom = bottomToolbarHeight;
    this.scrollViewToBottom();
  },

  showConversation: function cv_showConversation(num, pendingMsg) {
    var self = this;
    var view = this.view;
    var bodyclassList = document.body.classList;
    var currentScrollTop;

    if (num !== '*') {
      var filter = new MozSmsFilter();
      filter.numbers = [num || ''];

      if (this.filter == num)
        currentScrollTop = view.scrollTop;

      this.filter = num;
    } else {
      /* XXX: gaia issue #483 (New Message dialog design)
              gaia issue #108 (contact picker)
      */

      this.num.value = '';
      this.view.innerHTML = '';
      bodyclassList.add('conversation-new-msg');
      bodyclassList.add('conversation');
      return;
    }

    bodyclassList.remove('conversation-new-msg');

    var receiverId = parseInt(num);

    var self = this;
    var options = {
      filterBy: ['tel'],
      filterOp: 'contains',
      filterValue: num
    };
    var request = window.navigator.mozContacts.find(options);
    request.onsuccess = function findCallback() {
      if (request.result.length == 0)
        return;

      var contact = request.result[0];
      self.title.textContent = contact.name;
      var images = self.view.querySelectorAll('.photo img');
      for (var i = 0; i < images.length; i++)
        images[i].src = 'style/images/contact-placeholder.png';
    };

    this.num.value = num;

    this.title.textContent = num;
    this.title.num = num;

    MessageManager.getMessages(function mm_getMessages(messages) {
      var lastMessage = messages[messages.length - 1];
      if (pendingMsg &&
          (!lastMessage || lastMessage.id !== pendingMsg.id))
        messages.push(pendingMsg);

      var fragment = '';

      for (var i = 0; i < messages.length; i++) {
        var msg = messages[i];

        //var uuid = msg.hasOwnProperty('uuid') ? msg.uuid : '';
        var dataId = msg.id; // uuid

        var outgoing = (msg.delivery == 'sent' || msg.delivery == 'sending');
        var num = outgoing ? msg.receiver : msg.sender;
        var dataNum = num;

        var className = (outgoing ? 'receiver' : 'sender') + '"';
        if (msg.delivery == 'sending')
          className = 'receiver pending"';

        var pic = 'style/images/contact-placeholder.png';

        var body = msg.body.replace(/\n/g, '<br />');
        fragment += '<div class="message-block" ' + 'data-num="' + dataNum + '" data-id="' + dataId + '">' +
                      '<input type="checkbox" class="fake-checkbox"/>' + '<span></span>' +
                      '<div class="message-container ' + className + '>' +
                        '<div class="text">' + escapeHTML(body) + '</div>' +
                        '<div class="time" data-time="' + msg.timestamp.getTime() + '">' +
                            prettyDate(msg.timestamp) + '</div>' +
                      '</div>' + 
                     '</div>';
      }

      view.innerHTML = fragment;
      self.scrollViewToBottom(currentScrollTop);

      bodyclassList.add('conversation');
    }, filter, true);
  },

  deleteMessage: function cv_deleteMessage(messageId) {
    if (!messageId) 
      return;
    
    MessageManager.deleteMessage(messageId,function(result){
        if (result) {
          console.log("Message id: "+messageId+" deleted");
        } else {
          console.log("Impossible to delete message ID="+messageId);
        }
      });
  },

  deleteMessages: function cv_deleteMessages() {
    if (!this.delNumList || this.delNumList.length == 0)
      return;
    for (var i=0; i < this.delNumList.length; i++) {
      this.deleteMessage(this.delNumList[i]);//TODO shift[i]);
    };
    this.delNumList = [];
    this.showConversation(this.title.num);
    ConversationListView.updateConversationList();
    this.exitEditMode();
  },
  
  deleteAllMessages: function cv_deleteMessages() {
    // Clean current list in case messages checked
    this.delNumList = [];

    var inputElements_list = document.getElementById('view-list').getElementsByClassName('message-block');
    for (var i = 0; i < inputElements_list.length; i++) {
      this.delNumList.push(parseFloat(inputElements_list[i].dataset.id));
    }

    this.deleteMessages();
    this.hideConfirmationDialog();
  },

  handleEvent: function cv_handleEvent(evt) {
    switch (evt.type) {
      case 'keyup':
        if (evt.keyCode != evt.DOM_VK_ESCAPE)
          return;

        if (this.close())
          evt.preventDefault();
        break;

      case 'received':
        var msg = evt.message;

        if (this.filter)
          this.showConversation(ConversationView.filter, msg);
        break;

      case 'transitionend':
        if (document.body.classList.contains('conversation'))
          return;

        this.view.innerHTML = '';
        break;

      case 'hashchange':
        this.toggleEditMode(window.location.hash == '#edit');
        
        var num = this.getNumFromHash();
        if (!num) {
          this.filter = null;
          return;
        }

        this.showConversation(num);
        break;
        /**/
       // document.body.classList.remove('conversation');
       // document.body.classList.remove('conversation-new-msg');
        /**/
       
      case 'resize':
        if (!document.body.classList.contains('conversation'))
          return;

        this.updateInputHeight();
        this.scrollViewToBottom();
        break;
        
      case 'click':
        // When Event listening target is this.view and clicked target is a message.
        if (evt.currentTarget == this.view && ~evt.target.className.indexOf('message')) {
          this.onListItemClicked(evt);
        }
        break;
        
       case 'mousedown':
        switch (evt.currentTarget) {
          case this.doneButton:
            this.exitEditMode();
            break;
          case this.deleteButton:
            this.deleteMessages();
            break;
          case this.deleteAllButton:
            this.showConfirmationDialog();
            break;
          case this.acceptDialogButton:
            this.deleteAllMessages();
            break;
          case this.cancelDialogButton:
            this.hideConfirmationDialog();
            break;
        }
        break;
    }
  },
  
  showConfirmationDialog: function cv_showConfirmationDialog() {
    var bodyclassList = document.body.classList;
    bodyclassList.add('view-confirmation-pending');
  },

  hideConfirmationDialog: function cv_hideConfirmationDialog() {
    var bodyclassList = document.body.classList;
    bodyclassList.remove('view-confirmation-pending');
  },

  exitEditMode: function cv_exitEditMode(){
    // in case user ticks a message and then Done, we need to empty the deletion list
    this.delNumList = [];
    
    // Only from a existing message thread window (otherwise, no title.num)
    window.location.hash = "#num="+this.title.num;
  },
  
  toggleEditMode: function cv_toggleEditMode(show) {
    if (show) {      
      document.body.classList.add('edit-mode');  
    } else {
      document.body.classList.remove('edit-mode');
    }
  },
  
  onListItemClicked: function cv_onListItemClicked(evt) {
    var cb = evt.target.getElementsByClassName('fake-checkbox')[0];
    if (!cb){
      return;
    }
    if (!document.body.classList.contains('edit-mode')){
      return;
    }
    
    evt.preventDefault();
    cb.checked = !cb.checked;
    console.log("ID-"+evt.target.getAttribute('data-id'));
    var id = parseFloat(evt.target.getAttribute('data-id'));
    if (!id){
      return;
    }
    if (cb.checked) {
      this.delNumList.push(id);
    } else {
      this.delNumList.splice(this.delNumList.indexOf(id), 1);
    }
  },
  
  close: function cv_close() {
    if (!document.body.classList.contains('conversation') && !window.location.hash)
      return false;

    window.location.hash = '';
    return true;
  },
  
  sendMessage: function cv_sendMessage() {
    var num = this.num.value;
    var text = document.getElementById('view-msg-text').value;

    if (num === '' || text === '')
      return;

    MessageManager.send(num, text, function onsent(msg) {
      if (!msg) {
        ConversationView.input.value = text;
        ConversationView.updateInputHeight();

        if (ConversationView.filter) {
          if (window.location.hash !== '#num=' + ConversationView.filter)
            window.location.hash = '#num=' + ConversationView.filter;
          else
            ConversationView.showConversation(ConversationView.filter);
        }
        ConversationListView.updateConversationList();
        return;
      }

      // Add a slight delay so that the database has time to write the
      // message in the background. Ideally we'd just be updating the UI
      // from "sending..." to "sent" at this point...
      window.setTimeout(function() {
        if (ConversationView.filter) {
          if (window.location.hash !== '#num=' + ConversationView.filter)
            window.location.hash = '#num=' + ConversationView.filter;
          else
            ConversationView.showConversation(ConversationView.filter);
        }
        ConversationListView.updateConversationList();
      }, 100);
    });

    // Create a preliminary message object and update the view right away.
    var message = {
      sender: null,
      receiver: num,
      delivery: 'sending',
      body: text,
      timestamp: new Date()
    };

    window.setTimeout((function updateMessageField() {
      this.input.value = '';
      this.updateInputHeight();
      this.input.focus();

      if (this.filter) {
        this.showConversation(this.filter, message);
        return;
      }
      this.showConversation(num, message);
    }).bind(this), 0);

    ConversationListView.updateConversationList(message);
  }
};

window.addEventListener('localized', function showBody() {
  // get the [lang]-[REGION] setting
  // TODO: expose [REGION] in navigator.mozRegion or document.mozL10n.region?
  if (navigator.mozSettings) {
    var request = navigator.mozSettings.getLock().get('language.current');
    request.onsuccess = function() {
      selectedLocale = request.result['language.current'] || navigator.language;
      ConversationView.init();
      ConversationListView.init();
    }
  }

  // Set the 'lang' and 'dir' attributes to <html> when the page is translated
  if (document.mozL10n && document.mozL10n.language) {
    var lang = document.mozL10n.language;
    var html = document.querySelector('html');
    html.setAttribute('lang', lang.code);
    html.setAttribute('dir', lang.direction);
  }

  // <body> children are hidden until the UI is translated
  document.body.classList.remove('hidden');
});

var selectedLocale = 'en-US';

var kLocaleFormatting = {
  'en-US': 'xxx-xxx-xxxx',
  'fr-FR': 'xx xx xx xx xx',
  'es-ES': 'xx xxx xxxx'
};

function formatNumber(number) {
  var format = kLocaleFormatting[selectedLocale];

  if (number[0] == '+') {
    switch (number[1]) {
      case '1': // North America
        format = 'xx ' + kLocaleFormatting['en-US'];
        break;
      case '2': // Africa
        break;
      case '3': // Europe
        switch (number[2]) {
          case '0': // Greece
            break;
          case '1': // Netherlands
            break;
          case '2': // Belgium
            break;
          case '3': // France
            format = 'xxx ' + kLocaleFormatting['fr-FR'];
            break;
          case '4': // Spain
            format = 'xxx ' + kLocaleFormatting['es-ES'];
            break;
            break;
          case '5':
            break;
          case '6': // Hungary
            break;
          case '7':
            break;
          case '8':
            break;
          case '9': // Italy
            break;
        }
        break;
      case '4': // Europe
        break;
      case '5': // South/Latin America
        break;
      case '6': // South Pacific/Oceania
        break;
      case '7': // Russia and Kazakhstan
        break;
      case '8': // East Asia, Special Services
        break;
      case '9': // West and South Asia, Middle East
        break;
    }
  }

  var formatted = '';

  var index = 0;
  for (var i = 0; i < number.length; i++) {
    var c = format[index++];
    if (c && c != 'x') {
      formatted += c;
      index++;
    }

    formatted += number[i];
  }

  return formatted;
}

