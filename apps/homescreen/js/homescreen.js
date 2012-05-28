var owd = window.owd || {};

if(!owd.Homescreen) {

  (function(doc) {
    'use strict';

    // Strip is centered
    owdStrip.ui.init();
    owd.GridManager.init('.apps', '.dots');
   
    // Listening for keys 
    window.addEventListener('keyup', function(e) {
      if (e.keyCode === e.DOM_VK_HOME) {
        owd.GridManager.setMode('normal');
      }
    }, true);
    
    // Listening for installed apps
    owdAppManager.addEventListener('oninstall', function(app) {
      owd.GridManager.install(app);
    });
    
    // Listening for uninstalled apps
    navigator.mozApps.mgmt.onuninstall = function uninstall(event) {
      owd.GridManager.uninstall(event.application);
    };
    
    owd.Homescreen = {
      showContextualMenu: function(origin) {
        // FIXME: localize this message 
        var data = {
          origin: origin,
          options: [
            {
              label: 'Add to carousel',
              id: 'add'
            },{
              label: 'Delete App',
              id: 'delete'
            },
          ]
        };
        
        contextualMenu.show(data, function(action) {
          if (action === 'delete') {
            var app = owdAppManager.getByOrigin(origin);
  
            // FIXME: localize this message
            // FIXME: This could be a simple confirm() (see bug 741587)
            requestPermission(
              'Do you want to uninstall ' + app.manifest.name + '?',
              function() {
                app.uninstall();
              },
              function() { }
            );
          }
        });
      }
    };
    
    var startEvent = 'mousedown', moveEvent = 'mousemove',
        endEvent = 'mouseup', threshold = window.innerWidth / 3;
    
    var viewController = {
      
      init: function(container) {
        container.addEventListener(startEvent, this);
        this.pages = container.getElementsByClassName('view');
        this.total = this.pages.length;
        this.currentPage = 0;
      },
      
      navigate: function(number, duration) {
        var total = this.total;
        for (var n = 0; n < total; n++) {
          var page = this.pages[n];
          var style = page.style;
          style.MozTransform = 'translateX(' + (n - number) + '00%)';
          style.MozTransition = duration ? ('all ' + duration + 's ease') : '';
        }
        this.currentPage = number;
      },
      
      pan: function(x, duration) {
        var currentPage = this.currentPage;
        var total = this.total;
        for (var n = 0; n < total; n++) {
          var page = this.pages[n];
          var calc = (n - currentPage) * 100 + '% + ' + x + 'px';
          var style = page.style;
          style.MozTransform = 'translateX(-moz-calc(' + calc + '))';
          style.MozTransition = duration ? ('all ' + duration + 's ease') : '';
        }
      },
      
      /*
       * Event handling for the homescreen
       *
       * @param {Object} The event object from browser
       */
      handleEvent: function(evt) {
        switch (evt.type) {
          case startEvent:
            this.onStart(evt);
            break;
          case moveEvent:
            this.onMove(evt);
            break;
          case endEvent:
            this.onEnd(evt);
            break;
        }
      },
      
      onStart: function(evt) {
        this.startX = evt.pageX;
        window.addEventListener(moveEvent, this);
        window.addEventListener(endEvent, this);
      },
      
      onMove: function(evt) {
        this.pan(-(this.startX - evt.pageX), 0);
      },
      
      onEnd: function(evt) {
        window.removeEventListener(moveEvent, this);
        window.removeEventListener(endEvent, this);
        var diffX = evt.pageX - this.startX;
        var dir = 0; // Keep the position
        if (diffX > threshold && this.currentPage > 0) {
          dir = -1; // Previous
        } else if (diffX < -threshold && this.currentPage < this.total - 1) {
          dir = 1; // Next
        }
        this.navigate(this.currentPage + dir, 0.2);
      }
    }
    
    // Initializating the viewSwitcher
    viewController.init(doc.querySelector('#content'));
  })(document);
}