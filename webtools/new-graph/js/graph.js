/* ***** BEGIN LICENSE BLOCK *****
 * Version: MPL 1.1/GPL 2.0/LGPL 2.1
 *
 * The contents of this file are subject to the Mozilla Public License Version
 * 1.1 (the "License"); you may not use this file except in compliance with
 * the License. You may obtain a copy of the License at
 * http://www.mozilla.org/MPL/
 *
 * Software distributed under the License is distributed on an "AS IS" basis,
 * WITHOUT WARRANTY OF ANY KIND, either express or implied. See the License
 * for the specific language governing rights and limitations under the
 * License.
 *
 * The Original Code is new-graph code.
 *
 * The Initial Developer of the Original Code is
 *    Mozilla Corporation
 * Portions created by the Initial Developer are Copyright (C) 2006
 * the Initial Developer. All Rights Reserved.
 *
 * Contributor(s):
 *   Vladimir Vukicevic <vladimir@pobox.com> (Original Author)
 *   Alice Nodelman <anodelman@mozilla.com>
 *
 * Alternatively, the contents of this file may be used under the terms of
 * either the GNU General Public License Version 2 or later (the "GPL"), or
 * the GNU Lesser General Public License Version 2.1 or later (the "LGPL"),
 * in which case the provisions of the GPL or the LGPL are applicable instead
 * of those above. If you wish to allow use of your version of this file only
 * under the terms of either the GPL or the LGPL, and not to allow others to
 * use your version of this file under the terms of the MPL, indicate your
 * decision by deleting the provisions above and replace them with the notice
 * and other provisions required by the GPL or the LGPL. If you do not delete
 * the provisions above, a recipient may use your version of this file under
 * the terms of any one of the MPL, the GPL or the LGPL.
 *
 * ***** END LICENSE BLOCK ***** */

// all times are in seconds

const ONE_HOUR_SECONDS = 60*60;
const ONE_DAY_SECONDS = 24*ONE_HOUR_SECONDS;
const ONE_WEEK_SECONDS = 7*ONE_DAY_SECONDS;
const ONE_YEAR_SECONDS = 365*ONE_DAY_SECONDS; // leap years whatever.

const MONTH_ABBREV = [ "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec" ];

const CONTINUOUS_GRAPH = 0;
const DISCRETE_GRAPH = 1;
const DATA_GRAPH = 2;

const bonsaicgi = "bonsaibouncer.cgi";

// more days than this and we'll force user confirmation for the bonsai query
const bonsaiNoForceDays = 90;

// the default average interval
var gAverageInterval = 3*ONE_HOUR_SECONDS;
var gCurrentLoadRange = null;
var gForceBonsai = false;

var gOptions = { autoScaleYAxis: true };

var Tinderbox;
var BigPerfGraph;
var SmallPerfGraph;
var Bonsai;
var graphType;

var ResizableBigGraph;

var SmallGraphSizeRuleIndex;
var BigGraphSizeRuleIndex;

function loadingDone(graphTypePref) {

    loadOptions();

    //createLoggingPane(true);
    graphType = graphTypePref;

    if (graphType == CONTINUOUS_GRAPH) {
        Tinderbox = new TinderboxData();
        SmallPerfGraph = new CalendarTimeGraph("smallgraph");
        BigPerfGraph = new CalendarTimeGraph("graph");

        BigPerfGraph.drawPoints = true;

        onDataLoadChanged();
    } else if (graphType == DATA_GRAPH) {
        Tinderbox = new ExtraDataTinderboxData();
        SmallPerfGraph = new CalendarTimeGraph("smallgraph");
        BigPerfGraph = new CalendarTimeGraph("graph");
    } else {
        Tinderbox = new DiscreteTinderboxData();
        Tinderbox.raw = 1;
        SmallPerfGraph = new DiscreteGraph("smallgraph");
        BigPerfGraph = new DiscreteGraph("graph");

        onDiscreteDataLoadChanged();
    }

    // handle saved options
    if ("autoScaleYAxis" in gOptions) {
        if (gOptions.autoScaleYAxis) {
            getElement("autoscale").checked = true;
            onAutoScaleClick(true);
        } else {
            getElement("autoscale").checked = false;
            onAutoScaleClick(false);
        }
    }

    // create CSS "smallgraph-size" and "graph-size" rules that the
    // layout depends on
    {
        var sg = document.getElementById("smallgraph");
        var g = document.getElementById("graph");

        SmallGraphSizeRuleIndex = document.styleSheets[0].insertRule (
            ".smallgraph-size { width: " + sg.width + "px; height: " + sg.height + "px; }",
            document.styleSheets[0].cssRules.length);

        BigGraphSizeRuleIndex = document.styleSheets[0].insertRule (
            ".graph-size { width: " + g.width + "px; height: " + g.height + "px; }",
            document.styleSheets[0].cssRules.length);
    }

    var resizeFunction = function (nw, nh) {
        document.getElementById("graph").width = nw;
        document.getElementById("graph").height = nh;

        document.styleSheets[0].cssRules[BigGraphSizeRuleIndex].style.width = nw + "px";
        document.styleSheets[0].cssRules[BigGraphSizeRuleIndex].style.height = nh + "px";
        BigPerfGraph.resize();

        if (nw != document.getElementById("smallgraph").width) {
            document.getElementById("smallgraph").width = nw;
            document.styleSheets[0].cssRules[SmallGraphSizeRuleIndex].style.width = nw + "px";
            SmallPerfGraph.resize();
        }

        saveGraphDimensions(nw, nh);
    }

    var graphSize = { };
    if (loadGraphDimensions(graphSize))
        resizeFunction(graphSize.width, graphSize.height);

    // make the big graph resizable
    ResizableBigGraph = new ResizeGraph();
    ResizableBigGraph.init('graph', resizeFunction);

    Tinderbox.init();

    if (BonsaiService)
        Bonsai = new BonsaiService();

    SmallPerfGraph.yLabelHeight = 20;
    SmallPerfGraph.setSelectionType("range");
    BigPerfGraph.setSelectionType("cursor");
    BigPerfGraph.setCursorType("snap");


    SmallPerfGraph.onSelectionChanged.
        subscribe (function (type, args, obj) {
                       log ("selchanged");

                       if (args[0] == "range") {
                           var t1 = SmallPerfGraph.startTime;
                           var t2 = SmallPerfGraph.endTime;

                           if (args[1] && args[2]) {
                               t1 = args[1];
                               t2 = args[2];

                               var foundIndexes = [];

                               // make sure that there are at least two points
                               // on at least one graph for this
                               var foundPoints = false;
                               var dss = BigPerfGraph.dataSets;
                               for (var i = 0; i < dss.length; i++) {
                                   var idcs = dss[i].indicesForTimeRange(t1, t2);
                                   if (idcs[1] - idcs[0] > 1) {
                                       foundPoints = true;
                                       break;
                                   }
                                   foundIndexes.push(idcs);
                               }

                               if (!foundPoints) {
                                   // we didn't find at least two points in at least
                                   // one graph; so munge the time numbers until we do.
                                   log("Orig t1 " + t1 + " t2 " + t2);

                                   for (var i = 0; i < dss.length; i++) {
                                       if (foundIndexes[i][0] > 0) {
                                           t1 = Math.min(dss[i].data[(foundIndexes[i][0] - 1) * 2], t1);
                                       } else if (foundIndexes[i][1]+1 < (ds.data.length/2)) {
                                           t2 = Math.max(dss[i].data[(foundIndexes[i][1] + 1) * 2], t2);
                                       }
                                   }

                                   log("Fixed t1 " + t1 + " t2 " + t2);
                               }
                           }

                           if (document.getElementById("bonsailink"))
                               document.getElementById("bonsailink").href = makeBonsaiLink(t1, t2);

                           BigPerfGraph.setTimeRange (t1, t2);
                           BigPerfGraph.autoScale();
                           BigPerfGraph.redraw();
                       }
                       
                       updateLinkToThis();
                       updateDumpToCsv();
                   });

    BigPerfGraph.onCursorMoved.subscribe (onCursorMoved);

    if (graphType == CONTINUOUS_GRAPH) {
         BigPerfGraph.onNewGraph.
             subscribe (function(type, args, obj) {
               if (args[0].length >= GraphFormModules.length) {
                   clearLoadingAnimation();
               }
             });
    } else if (graphType == DATA_GRAPH || graphType == DISCRETE_GRAPH) {
         BigPerfGraph.onNewGraph.
             subscribe (function(type, args, obj) {
                            showGraphList(args[0]);
                        });
    }

    if (document.location.hash) {
        handleHash(document.location.hash);
    } else {
        if (graphType == CONTINUOUS_GRAPH) {
            addGraphForm();
        } else if (graphType == DATA_GRAPH) {
            addExtraDataGraphForm();
        } else {
            addDiscreteGraphForm();
        }
    }
}

function loadGraphDimensions(data) {
    if (!globalStorage || document.domain == "")
        return false;

    try {
        var store = globalStorage[document.domain];

        if (!("graphWidth" in store) || !("graphHeight" in store))
            return false;

        var w = parseInt(store.graphWidth);
        var h = parseInt(store.graphHeight);

        if (w != w || h != h || w <= 0 || h <= 0)
            return false;
        
        data.width = w;
        data.height = h;

        return true;
    } catch (ex) {
    }

    return false;
}

function saveGraphDimensions(w, h) {
    if (!globalStorage || document.domain == "")
        return false;

    try {
        if (parseInt(w) != w || parseInt(h) != h)
            return false;

        globalStorage[document.domain].graphWidth = w;
        globalStorage[document.domain].graphHeight = h;
        return true;
    } catch (ex) {
    }

    return false;
}

function addExtraDataGraphForm(config, name) {
    showLoadingAnimation("populating lists");
    var ed = new ExtraDataGraphFormModule(config, name);
    ed.onLoading.subscribe (function(type,args,obj) { showLoadingAnimation(args[0]);});
    ed.onLoadingDone.subscribe (function(type,args,obj) { clearLoadingAnimation();});
    if (config) {
        ed.addedInitialInfo.subscribe(function(type,args,obj) { graphInitial();});
    }
    ed.render (getElement("graphforms"));
    return ed;
}

function addDiscreteGraphForm(config, name) {
    showLoadingAnimation("populating lists");
    //log("name: " + name);
    var m = new DiscreteGraphFormModule(config, name);
    m.onLoading.subscribe (function(type,args,obj) { showLoadingAnimation(args[0]);});
    m.onLoadingDone.subscribe (function(type,args,obj) { clearLoadingAnimation();});
    if (config) {
        m.addedInitialInfo.subscribe(function(type,args,obj) { graphInitial();});
    }
    m.render (getElement("graphforms"));
    //m.setColor(randomColor());
    return m;
}

function addGraphForm(config) {
    showLoadingAnimation("populating list");
    var m = new GraphFormModule(config);
    m.render (getElement("graphforms"));
    m.setColor(randomColor());
    m.onLoading.subscribe (function(type,args,obj) { showLoadingAnimation(args[0]);});
    m.onLoadingDone.subscribe (function(type,args,obj) { clearLoadingAnimation();});
    return m;
}

function onNoBaseLineClick() {
    GraphFormModules.forEach (function (g) { g.baseline = false; });
}

// whether the bonsai data query should redraw the graph or not
var gReadyForRedraw = true;

function onUpdateBonsai() {
    BigPerfGraph.deleteAllMarkers();

    getElement("bonsaibutton").disabled = true;

    if (gCurrentLoadRange) {
        if ((gCurrentLoadRange[1] - gCurrentLoadRange[0]) < (bonsaiNoForceDays * ONE_DAY_SECONDS) || gForceBonsai) {
            Bonsai.requestCheckinsBetween (gCurrentLoadRange[0], gCurrentLoadRange[1],
                                           function (bdata) {
                                               for (var i = 0; i < bdata.times.length; i++) {
                                                   BigPerfGraph.addMarker (bdata.times[i], bdata.who[i] + ": " + bdata.comment[i]);
                                               }
                                               if (gReadyForRedraw)
                                                   BigPerfGraph.redraw();

                                               getElement("bonsaibutton").disabled = false;
                                           });
        }
    }
}



function onGraph()  {
    showLoadingAnimation("building graph");
    showStatus(null);
    for each (var g in [BigPerfGraph, SmallPerfGraph]) {
        g.clearDataSets();
        g.setTimeRange(null, null);
    }

    gReadyForRedraw = false;

    // do the actual graph data request
    var baselineModule = null;
    GraphFormModules.forEach (function (g) { if (g.baseline) baselineModule = g; });
    if (baselineModule) {
        Tinderbox.requestDataSetFor (baselineModule.testId,
                                     function (testid, ds) {
                                         try {
                                             //log ("Got results for baseline: '" + testid + "' ds: " + ds);
                                             ds.color = baselineModule.color;
                                             onGraphLoadRemainder(ds);
                                         } catch(e) { log(e); }
                                     });
    } else {
        onGraphLoadRemainder();
    }
}

function onGraphLoadRemainder(baselineDataSet) {
    for each (var graphModule in GraphFormModules) {
        //log ("onGraphLoadRemainder: ", graphModule.id, graphModule.testId, "color:", graphModule.color, "average:", graphModule.average);

        // this would have been loaded earlier
        if (graphModule.baseline)
            continue;

        var autoExpand = true;
        if (SmallPerfGraph.selectionType == "range" &&
            SmallPerfGraph.selectionStartTime &&
            SmallPerfGraph.selectionEndTime)
        {
            if (gCurrentLoadRange && (SmallPerfGraph.selectionStartTime < gCurrentLoadRange[0] ||
                SmallPerfGraph.selectionEndTime > gCurrentLoadRange[1]))
            {
                SmallPerfGraph.selectionStartTime = Math.max (SmallPerfGraph.selectionStartTime, gCurrentLoadRange[0]);
                SmallPerfGraph.selectionEndTime = Math.min (SmallPerfGraph.selectionEndTime, gCurrentLoadRange[1]);
            }

            BigPerfGraph.setTimeRange (SmallPerfGraph.selectionStartTime, SmallPerfGraph.selectionEndTime);
            autoExpand = false;
        }

        // we need a new closure here so that we can get the right value
        // of graphModule in our closure
        var makeCallback = function (module, color, title) {
            return function (testid, ds) {
                try {
                    log("ds.firstTime " + ds.firstTime + " ds.lastTime " + ds.lastTime);
                    if (!("firstTime" in ds) || !("lastTime" in ds)) {
                       // got a data set with no data in this time range, or damaged data
                       // better to not graph
                       for each (g in [BigPerfGraph, SmallPerfGraph]) {
                           g.clearGraph();

                       }
                       showStatus("No data in the given time range");
                       clearLoadingAnimation();
                       
                    }
                    else {
                        ds.color = color;
                        if (title) {
                            ds.title = title;
                        }

                        if (baselineDataSet)
                            ds = ds.createRelativeTo(baselineDataSet);

                        //log ("got ds: (", module.id, ")", ds.firstTime, ds.lastTime, ds.data.length);
                        var avgds = null;
                        if (baselineDataSet == null &&
                            module.average)
                        {
                            avgds = ds.createAverage(gAverageInterval);
                        }

                        if (avgds)
                            log ("got avgds: (", module.id, ")", avgds.firstTime, avgds.lastTime, avgds.data.length);
                        
                        for each (g in [BigPerfGraph, SmallPerfGraph]) {
                            g.addDataSet(ds);
                            if (avgds)
                                g.addDataSet(avgds);
                            if (g == SmallPerfGraph || autoExpand) {
                                g.expandTimeRange(Math.max(ds.firstTime, gCurrentLoadRange ? gCurrentLoadRange[0] : ds.firstTime),
                                                  Math.min(ds.lastTime, gCurrentLoadRange ? gCurrentLoadRange[1] : ds.lastTime));
                            }

                            g.autoScale();

                            g.redraw();
                            gReadyForRedraw = true;
                        }

                        //if (graphType == CONTINUOUS_GRAPH) {
                            updateLinkToThis();
                            updateDumpToCsv();
                        //}
                    }

                } catch(e) { log(e); }
            };
        };

        if (graphModule.testIds) {  
          if ( graphType == DISCRETE_GRAPH ) {
            var testIds = new Array();
            for each ( var testId in graphModule.testIds ) {
                testIds[testId[0]] = makeCallback(graphModule, randomColor(), testId[1]);
            }
            Tinderbox.requestDataSetFor(testIds);
          } else { 
              for each (var testId in graphModule.testIds) { 
               // log ("working with testId: " + testId);
                Tinderbox.requestDataSetFor (testId[0], makeCallback(graphModule, randomColor(), testId[1]));
              }
          }
        }
        else {
           // log ("working with standard, single testId");
            Tinderbox.requestDataSetFor (graphModule.testId, makeCallback(graphModule, graphModule.color));
        }
    }
}


function onDataLoadChanged() {
    log ("loadchanged");
    if (getElement("load-days-radio").checked) {
        var dval = new Number(getElement("load-days-entry").value);
        log ("dval", dval);
        if (dval <= 0) {
            //getElement("load-days-entry").style.background-color = "red";
            return;
        } else {
            //getElement("load-days-entry").style.background-color = "inherit";
        }

        var d2 = Math.ceil(Date.now() / 1000);
        d2 = (d2 - (d2 % ONE_DAY_SECONDS)) + ONE_DAY_SECONDS;
        var d1 = Math.floor(d2 - (dval * ONE_DAY_SECONDS));
        log ("drange", d1, d2);

        Tinderbox.defaultLoadRange = [d1, d2];
        gCurrentLoadRange = [d1, d2];
    } else {
        Tinderbox.defaultLoadRange = null;
        gCurrentLoadRange = null;
    }

    Tinderbox.clearValueDataSets();

    // hack, reset colors
    randomColorBias = 0;
}

function onExtraDataLoadChanged() {
    log ("loadchanged");
    Tinderbox.defaultLoadRange = null;
    gCurrentLoadRange = null;

    // hack, reset colors
    randomColorBias = 0;
}


function onDiscreteDataLoadChanged() {
    log ("loadchanged");
    Tinderbox.defaultLoadRange = null;
    gCurrentLoadRange = null;

    // hack, reset colors
    randomColorBias = 0;
}

function findGraphModule(testId) {
    for each (var gm in GraphFormModules) {
        if (gm.testId == testId)
            return gm;
    }
    return null;
}

function updateDumpToCsv() {
  var ds = "?"
  prefix = ""
  for each (var gm in GraphFormModules) {
    ds += prefix + gm.getDumpString();
    prefix = "&"
  }
  log ("ds");
  getElement("dumptocsv").href = "http://" + document.location.host + "/dumpdata.cgi" + ds;
}

function updateLinkToThis() {
    var qs = "";

    qs += SmallPerfGraph.getQueryString("sp");
    qs += "&";
    qs += BigPerfGraph.getQueryString("bp");

    if (graphType == CONTINUOUS_GRAPH) {
        var ctr = 1;
        for each (var gm in GraphFormModules) {
            qs += "&" + gm.getQueryString("m" + ctr);
            ctr++;
        }
    }
    else {
        qs += "&";
        qs += "name=" + GraphFormModules[0].name;
        for each (var gm in GraphFormModules) {
            qs += gm.getQueryString("m");
        }
    }

    getElement("linktothis").href = document.location.pathname + "#" + qs;
}

function handleHash(hash) {
    var qsdata = {};
    for each (var s in hash.substring(1).split("&")) {
        var q = s.split("=");
        qsdata[q[0]] = q[1];
    }

    if (graphType == CONTINUOUS_GRAPH) {
        var ctr = 1;
        while (("m" + ctr + "tid") in qsdata) {
            var prefix = "m" + ctr;
            addGraphForm({testid: qsdata[prefix + "tid"],
                      average: qsdata[prefix + "avg"]});
            ctr++;
        }
    }
    else {
        var ctr=1;
        testids = [];
        while (("m" + ctr + "tid") in qsdata) {
            var prefix = "m" + ctr;
            testids.push(Number(qsdata[prefix + "tid"]));       
            ctr++;
        }
       // log("qsdata[name] " + qsdata["name"]);
        addDiscreteGraphForm(testids, qsdata["name"]);
    }

    SmallPerfGraph.handleQueryStringData("sp", qsdata);
    BigPerfGraph.handleQueryStringData("bp", qsdata);

    var tstart = new Number(qsdata["spstart"]);
    var tend = new Number(qsdata["spend"]);

    //Tinderbox.defaultLoadRange = [tstart, tend];

    if (graphType == CONTINUOUS_GRAPH) {
        Tinderbox.requestTestList(function (tests) {
            setTimeout (onGraph, 0); // let the other handlers do their thing
        });
    }
}

function graphInitial() {
    GraphFormModules[0].addedInitialInfo.unsubscribeAll();
    Tinderbox.requestTestList(null, null, null, null, function (tests) { 
        setTimeout(onGraph, 0); 
    });
}

function showStatus(s) {
    replaceChildNodes("status", s);
}

function showLoadingAnimation(message) {
    //log("starting loading animation: " + message);
    td = new SPAN();
    el = new IMG({ src: "js/img/Throbber-small.gif"}); 
    appendChildNodes(td, el);
    appendChildNodes(td, " loading: " + message + " ");
    replaceChildNodes("loading", td);
}

function clearLoadingAnimation() {
    //log("ending loading animation");
    replaceChildNodes("loading", null);
}

function showGraphList(s) {
    replaceChildNodes("graph-label-list",null);
   // log("s: " +s);
    var tbl = new TABLE({});
    var tbl_tr = new TR();
    appendChildNodes(tbl_tr, new TD(""));
    appendChildNodes(tbl_tr, new TD("avg"));
    appendChildNodes(tbl_tr, new TD("max"));
    appendChildNodes(tbl_tr, new TD("min"));
    appendChildNodes(tbl_tr, new TD("test name"));
    appendChildNodes(tbl, tbl_tr);
    for each (var ds in s) {
       var tbl_tr = new TR();
       var rstring = ds.stats + " ";
       var colorDiv = new DIV({ id: "whee", style: "display: inline; border: 1px solid black; height: 15; " +
                              "padding-right: 15; vertical-align: middle; margin: 3px;" });
       colorDiv.style.backgroundColor = colorToRgbString(ds.color);
      // log("ds.stats" + ds.stats);
       appendChildNodes(tbl_tr, colorDiv);
       for each (var val in ds.stats) {
         appendChildNodes(tbl_tr, new TD(val.toFixed(2)));
       }
       appendChildNodes(tbl, tbl_tr);
       appendChildNodes(tbl_tr, new TD(ds.title));
    } 
    appendChildNodes("graph-label-list", tbl);
    if (GraphFormModules.length > 0 &&
        GraphFormModules[0].testIds &&
        s.length == GraphFormModules[0].testIds.length)
    {
      clearLoadingAnimation();
    }
    //replaceChildNodes("graph-label-list",rstring);
}

/* Get some pre-set colors in for the first 5 graphs, thens start randomly generating stuff */
var presetColorIndex = 0;
var presetColors = [
    [0.0, 0.0, 0.7, 1.0],
    [0.0, 0.5, 0.0, 1.0],
    [0.7, 0.0, 0.0, 1.0],
    [0.7, 0.0, 0.7, 1.0],
    [0.0, 0.7, 0.7, 1.0]
];

var randomColorBias = 0;
function randomColor() {
    if (presetColorIndex < presetColors.length) {
        return presetColors[presetColorIndex++];
    }

    var col = [
        (Math.random()*0.5) + ((randomColorBias==0) ? 0.5 : 0.2),
        (Math.random()*0.5) + ((randomColorBias==1) ? 0.5 : 0.2),
        (Math.random()*0.5) + ((randomColorBias==2) ? 0.5 : 0.2),
        1.0
    ];
    randomColorBias++;
    if (randomColorBias == 3)
        randomColorBias = 0;

    return col;
}

function lighterColor(col) {
    return [
        Math.min(0.85, col[0] * 1.2),
        Math.min(0.85, col[1] * 1.2),
        Math.min(0.85, col[2] * 1.2),
        col[3]
    ];
}

function colorToRgbString(col) {
   // log ("in colorToRgbString");
    if (col[3] < 1) {
        return "rgba("
            + Math.floor(col[0]*255) + ","
            + Math.floor(col[1]*255) + ","
            + Math.floor(col[2]*255) + ","
            + col[3]
            + ")";
    }
    return "rgb("
        + Math.floor(col[0]*255) + ","
        + Math.floor(col[1]*255) + ","
        + Math.floor(col[2]*255) + ")";
}

function makeBonsaiLink(start, end) {
    // harcode PhoenixTinderbox, oh well.
    return "http://bonsai.mozilla.org/cvsquery.cgi?treeid=default&module=PhoenixTinderbox&branch=HEAD&branchtype=match&dir=&file=&filetype=match&who=&whotype=match&sortby=Date&hours=2&date=explicit&cvsroot=%2Fcvsroot&mindate=" + Math.floor(start) + "&maxdate=" + Math.ceil(end);
}

function onAutoScaleClick(override) {
    var checked;
    if (override != null) {
        checked = override;
    } else {
        checked = getElement("autoscale").checked;
    }

    var graphs = [ BigPerfGraph, SmallPerfGraph ];
    for each (var g in graphs) {
        if (g.autoScaleYAxis != checked) {
            g.autoScaleYAxis = checked;
            g.autoScale();
            g.redraw();
        }
    }

    gOptions.autoScaleYAxis = checked;
    saveOptions();
}

function loadOptions() {
    if (!globalStorage || document.domain == "")
        return false;

    try {
        var store = globalStorage[document.domain];

        if ("graphOptions" in store) {
            var s = (store["graphOptions"]).toString();
            var tmp = eval(s);
            // don't clobber newly defined options
            for (var opt in tmp)
                gOptions[opt] = tmp[opt];
        }
    } catch (ex) {
    }
}

// This just needs to be called whenever an option changes, we don't
// have a good mechanism for this, so we just call it from wherever
// we change an option
function saveOptions() {
    if (!globalStorage || document.domain == "")
        return false;

    try {
        var store = globalStorage[document.domain];
        store["graphOptions"] = uneval(gOptions);
    } catch (ex) {
    }
}

function onCursorMoved(type, args, obj) {
    var time = args[0];
    var val = args[1];
    var extra_data = args[2];

    var extra = "";
    var label = "Date: ";
    if (graphType == DISCRETE_GRAPH) {
        label = "Index: ";
        extra = extra_data;
    }

    if (time != null && val != null) {
        // cheat
        showStatus(label + formatTime(time) + " Value: " + val.toFixed(2) + " " + extra);
        showFloater(time, val);
    } else {
        showStatus(null);
        showFloater(null);
    }
}

function showFloater(time, value) {
    var fdiv = getElement("floater");

    if (time == null) {
        fdiv.style.visibility = "hidden";
        return;
    }

    fdiv.style.visibility = "visible";

    var dss = BigPerfGraph.dataSets;
    if (dss.length == 0)
        return;

    var s = "";

    var dstv = [];

    for (var i = 0; i < dss.length; i++) {
        if ("averageOf" in dss[i])
            continue;

        var idx = dss[i].indexForTime(time, true);
        if (idx != -1) {
            var t = dss[i].data[idx*2];
            var v = dss[i].data[idx*2+1];
            dstv.push( {time: t, value: v, color: dss[i].color} );
        }
    }

    var columns = [];
    for (var i = 0; i < dstv.length; i++) {
        var column = [];
        for (var j = 0; j < dstv.length; j++) {
            if (i == j) {
                var v = dstv[i].value;
                if (v != Math.floor(v))
                    v = v.toFixed(2);
                column.push("<b>" + v + "</b>");
            } else {
                var ratio = dstv[j].value / dstv[i].value;
                column.push("<span style='font-size: small'>" + (ratio * 100).toFixed(0) + "%</span>");
            }
        }
        columns.push(column);
    }

    var s = "<table class='floater-table'>";
    for (var i = 0; i < dstv.length; i++) {
        s += "<tr style='color: " + colorToRgbString(dstv[i].color) + "'>";
        for (var j = 0; j < columns.length; j++) {
            s += "<td>" + columns[i][j] + "</td>";
        }
        s += "</tr>";
    }
    s += "</table>";

    // then put the floater in the right spot
    var xy = BigPerfGraph.timeValueToXY(time, value);
    fdiv.style.left = Math.floor(xy.x + 65) + "px";
    fdiv.style.top = Math.floor((BigPerfGraph.frontBuffer.height - xy.y) + 15) + "px";
    fdiv.innerHTML = s;
}

