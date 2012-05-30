/*
* Module: Comms
*
* Product: Open Web Device
*
* Copyright(c) 2012 Telefónica I+D S.A.U.
*
* LICENSE: Apache 2.0
*
* @author Telefonica Digital
*/

'use strict';

//List of apps that will be displayed in the launcher
//TODO: Move this to use apps origins instead of app names.
var ITEMS = ['Dialer', 'Messages', 'Comms', 'Browser'];

// Controls the app showed within the comms app.
var CommsLauncher = {
  //What's the current app we are displaying now
  currentApp: {},
  /*
  Object that will contain app holders
  (objects pointing to the app + frame associated)
  */
  apps: {

  },

  //Given a path name, creates or displays the app
  launch: function _launch(appName) {
    //Special case for comms
    //TODO: This will be replaces when there is a proper comms app
    if (appName == 'Comms') {
      if (this.currentApp.hasOwnProperty('frame')) {
        this.currentApp.frame.className = 'hidden';
      }
      return;
    }

    if (!this.apps.hasOwnProperty(appName)) {
      return;
    }

    //Security check, if not in the list of apps, dont continue
    var appContainer = this.apps[appName];
    if (appContainer == this.currentApp) {
      this.currentApp.frame.className = 'currentApp';
      return;
    }

    //Show the new one
    var manifest = appContainer.app.manifest;
    if (!appContainer.hasOwnProperty('frame')) {
      //Create a new frame if the application wasn't opened
      var frame = document.createElement('iframe');

      frame.src = appContainer.app.origin;
      if (manifest.hasOwnProperty('launch_path') &&
          manifest.launch_path != '/') {
        frame.src += manifest.launch_path;
      }
      frame.setAttribute('frameBorder', 'no');
      frame.setAttribute('mozbrowser', 'true');
      frame.setAttribute('mozapp', appContainer.app.origin);
      frame.className = 'hidden'; //start hidden

      appContainer.frame = frame;
      document.getElementById('screen').appendChild(appContainer.frame);
    }
    //Show the new app
    appContainer.frame.className = 'currentApp';

    //Hide the old one
    if (this.currentApp.hasOwnProperty('frame')) {
      this.currentApp.frame.className = 'hidden';
    }

    //Current is the new one
    this.currentApp = this.apps[appName];
  },

  /**
    Walk the installed apps, and extract the apps definitions for those
    that we are going to handle
  */
  setupApps: function _setupApps() {
    var self = this;
    navigator.mozApps.mgmt.getAll().onsuccess = function(e) {
      var installedApps = e.target.result;
      installedApps.forEach(function(app) {
        if (ITEMS.indexOf(app.manifest.name) >= 0) {
          self.apps[app.manifest.name] = {'app': app};
        }
      });
    };
  },

  /**
    Add the listeners to the menu
  */
  setupMenu: function _menu() {
    var self = this;
    var handler = function(evt) {
      self.launch(evt.currentTarget.id);
    };

    ITEMS.forEach(function(component) {
      if (document.getElementById(component)) {
        var action = document.getElementById(component);
        action.addEventListener('mousedown', handler);
      }
    });
  },

  /**
    Init the comms app
  */
  init: function _init() {
    this.setupApps();
    this.setupMenu();
  }

};

CommsLauncher.init();

