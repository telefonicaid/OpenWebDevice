'use strict';
var owd = window.owd || {};

if (!owd.Icon) {

  owd.Icon = function(app) {
    var origin = owdAppManager.getOrigin(app);
  
    this.descriptor = {
      origin: origin,
      name: owdAppManager.getName(origin),
      icon: owdAppManager.getIcon(origin)
    };
  
    this.type = 'owd.Icon';
  }

  owd.Icon.prototype = {
    render: function(target, container) {
      /*
       * <li dataset-origin="zzz">
       *   <div>
       *    <img src="xxx"></img>
       *    <span>yyy</span>
       *   </div>
       *   <div class="icon" dataset-origin="zzz">
       *    <span class="options"></span>
       *   </div>
       * </li>
       */
      this.dragabbleSection = container.parentNode;
      
      var listItem = this.listItem = document.createElement('li');

      var name = this.descriptor.name;
      var origin = this.descriptor.origin;
      
      // Icon container
      var figure = this.figure = document.createElement('div');
      figure.className = 'figure';

      // Image
      var img = document.createElement('img');
      img.src = this.descriptor.icon;
      figure.appendChild(img);
      
      img.onerror = function() {
        img.src  = 'http://' + document.location.host + '/resources/images/Unknown.png';
      }
      
      img.onload = function() {
        var style = img.style;
        var w = img.width;
        style.height  = w + 'px';
        //style.borderRadius = w/2 + 'px';
      }

      // Label
      var label = document.createElement('span');
      label.textContent = name;
      figure.appendChild(label);

      listItem.appendChild(figure);

      // Shader
      var shader = document.createElement('div');
      shader.className = 'icon';
      shader.dataset.origin = origin;
      listItem.appendChild(shader);

      // Options button
      var options = document.createElement('span');
      options.className = 'options';
      shader.appendChild(options);
      
      listItem.dataset.origin = origin;
      
      target.appendChild(listItem);
    },

    getListItem: function() {
      return this.listItem;
    },
    
    onDragStart: function(x, y) {
      this.initX = x;
      this.initY = y;
      
      var draggableElem = this.draggableElem = this.figure.cloneNode();
      draggableElem.className = 'draggable';

      var li = this.listItem;
      li.dataset.dragging = 'true';
      
      var rectangle = li.getBoundingClientRect();
      var style = draggableElem.style;
      style.left = rectangle.left + 'px';
      style.top = rectangle.top + 'px';
      
      this.dragabbleSection.appendChild(draggableElem);
    },
    
    onDragMove: function(x, y) {
      this.draggableElem.style.MozTransform = 'translate('
        + (x - this.initX) + 'px,'
        + (y - this.initY) + 'px)';
    },
    
    onDragStop: function() {
      delete this.listItem.dataset.dragging;
      this.dragabbleSection.removeChild(this.draggableElem);
    }
    
  }
}

if (!owd.Page) {

  owd.Page = function() {
    this.licons = {};
  }

  owd.Page.prototype = {

    vars: {
      transitionend: 'transitionend',
      right: 'right',
      left: 'left',
      center: 'center'
    },

    render: function(apps, target) {
      this.container = target;
      var len = apps.length;
      this.olist = document.createElement('ol');
      for (var i = 0; i < len; i++) {
        var app = apps[i];
        if (typeof app === 'string') {
          // We receive an origin here else it's an app or icon
          app = owdAppManager.getByOrigin(app);
        }
        // We have to check if the app is installed just in case (DB could is corrupted)
        if (app) {
          this.append(app);
        }
      }
      target.appendChild(this.olist);
    },

    setTranstionDuration: function(style, duration) {
      style.MozTransition = duration ? ('all ' + duration + 's ease') : '';
    },

    moveToRight: function() {
      var style = this.container.style;
      style.MozTransform = 'translateX(100%)';
      this.setTranstionDuration(style, 0.2);
    },

    moveToLeft: function() {
      var style = this.container.style;
      style.MozTransform = 'translateX(-100%)';
      this.setTranstionDuration(style, 0.2);
    },

    moveToCenter: function() {
      var style = this.container.style;
      style.MozTransform = 'translateX(0)';
      this.setTranstionDuration(style, 0.2);
    },

    moveTo: function(translate) {
      var style = this.container.style;
      style.MozTransform = 'translateX(-moz-calc(' + translate + '))';
      this.setTranstionDuration(style, 0);
    },

    getIcon: function(origin) {
      return this.licons[origin];
    },

    drop: function(origin, target, dir) {
      var licons = this.licons;
      if (dir < 0) {
        // backwards
        this.olist.insertBefore(licons[origin].getListItem(), licons[target].getListItem());
      } else {
        // upwards
        this.olist.insertBefore(licons[origin].getListItem(), licons[target].getListItem().nextSibling);
      }
    },

    tap: function(elem) {
      var dataset = elem.dataset;
      if ('origin' in dataset) {
        if (owd.GridManager.isEditMode()) {
          owd.Homescreen.showContextualMenu(dataset.origin);
        } else {
          owdAppManager.launch(dataset.origin);
        }
      }
    },

    prependIcon: function(icon) {
      var len = this.olist.length;
      if (len > 0) {
        this.olist.insertBefore(icon.getListItem(), this.olist.firstChild);
      } else {
        this.olist.appendChild(icon.getListItem());
      }
      this.licons[icon.descriptor.origin] = icon;
    },

    popIcon: function() {
      var icon = this.getLastIcon();
      this.remove(icon);
      return icon;
    },

    getLastIcon: function() {
      return this.licons[this.olist.lastChild.dataset.origin];
    },
    
    append: function(app) {
      if (app.type && app.type === 'owd.Icon') {
        this.olist.appendChild(app.getListItem());
        this.licons[app.descriptor.origin] = app;
      } else {
        // This is a moz app
        var icon = new owd.Icon(app);
        icon.render(this.olist, this.container);
        this.licons[app.origin] = icon;
      }
    },

    remove: function(app) {
      var icon = app;
      if ('owd.Icon' !== app.type) {
        // This is a moz app
        icon = this.licons[app.origin];
      }
      this.olist.removeChild(icon.getListItem());
      delete this.licons[icon.descriptor.origin];
    },

    destroy: function() {
      delete this.licons;
      this.container.parentNode.removeChild(this.container);
    },
    
    getNumApps: function() {
      return this.olist.childNodes.length;
    },

   /*
    * Returns the list of apps
    */
    getAppsList: function() {
      var ret = [];
      var nodes = this.olist.childNodes;
      var len = nodes.length;
      for(var i = 0; i < len; i++) {
        ret.push(nodes[i].dataset.origin);
      }
      return ret;
    }
  }
}
