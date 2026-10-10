(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.CourtModel = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  var sequence = 0;
  var WIDTH = 600;
  var HEIGHTS = { half: 620, full: 1128 };
  var TYPES = ['move', 'dribble', 'pass', 'screen'];

  function uid() {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
    sequence += 1;
    return 'cs-' + Date.now().toString(36) + '-' + sequence.toString(36) + '-' + Math.random().toString(36).slice(2, 9);
  }
  function clone(value) { return JSON.parse(JSON.stringify(value)); }
  function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function point(x, y) { return { x: x, y: y }; }
  function player(id, label, x, y, team) {
    return { id: id, label: String(label), x: x, y: y, team: team || 'offense' };
  }
  function makeFrame(players, owner, name) {
    var holder = players.find(function (p) { return p.id === owner; });
    return {
      id: uid(), name: name || 'Starting formation', notes: '', duration: 3, motionDuration: 3,
      players: players, ballOwner: owner || null,
      ball: holder ? point(holder.x, holder.y) : point(300, 360), actions: [], labels: []
    };
  }

  function createPlay(template, name) {
    template = template || '5-out';
    var positions;
    if (template === 'horns') positions = [[300, 480], [76, 455], [524, 455], [208, 285], [392, 285]];
    else if (template === 'box') positions = [[375, 42], [200, 305], [400, 305], [200, 155], [400, 155]];
    else positions = [[300, 478], [115, 355], [485, 355], [85, 165], [515, 165]];
    var players = template === 'empty' ? [] : positions.map(function (pos, i) { return player(uid(), i + 1, pos[0], pos[1]); });
    return {
      id: uid(), name: name || 'Untitled play', category: template === 'box' ? 'Inbound' : 'Offense',
      court: 'half', frames: [makeFrame(players, players.length ? players[0].id : null)],
      updatedAt: new Date().toISOString()
    };
  }

  // Movement and screens run together. If a frame contains several passes, those
  // passes run in their listed order, sharing the motion duration equally.
  // The finished movement holds for the remainder of the step's reading time.
  // An attached move uses the player's actual start position. Unattached arrows
  // remain coaching annotations. A pass never changes its passer's position.
  function interpolateFrame(frame, progress) {
    var elapsedFraction = clamp(Number.isFinite(progress) ? progress : 0, 0, 1);
    var t = clamp(elapsedFraction * frame.duration / (frame.motionDuration || frame.duration), 0, 1);
    var result = clone(frame);
    var starts = new Map(frame.players.map(function (p) { return [p.id, p]; }));
    var movements = new Map();
    (frame.actions || []).forEach(function (action) {
      if (action.type !== 'pass' && action.playerId && starts.has(action.playerId)) movements.set(action.playerId, action);
    });
    function positionAt(id, at) {
      var p = starts.get(id);
      if (!p) return null;
      var action = movements.get(id);
      return action ? point(lerp(p.x, action.to.x, at), lerp(p.y, action.to.y, at)) : point(p.x, p.y);
    }
    result.players.forEach(function (p) {
      var pos = positionAt(p.id, t);
      p.x = pos.x; p.y = pos.y;
    });
    var passes = (frame.actions || []).filter(function (action) { return action.type === 'pass'; });
    if (passes.length && t > 0) {
      var passIndex = Math.min(passes.length - 1, Math.floor(t * passes.length));
      var pass = passes[passIndex];
      var passProgress = clamp(t * passes.length - passIndex, 0, 1);
      var passStartTime = passIndex / passes.length;
      var from = positionAt(pass.playerId, passStartTime) || pass.from;
      var to = positionAt(pass.targetId, t) || pass.to;
      result.ball = point(lerp(from.x, to.x, passProgress), lerp(from.y, to.y, passProgress));
      result.ballOwner = t === 1 ? (pass.targetId || null) : null;
    } else {
      var holder = positionAt(frame.ballOwner, t);
      result.ball = holder || clone(frame.ball);
      result.ballOwner = holder ? frame.ballOwner : null;
    }
    return result;
  }
  function endFrame(frame) { return interpolateFrame(frame, 1); }
  function nextFrame(frame) {
    var result = endFrame(frame);
    result.id = uid();
    result.name = 'Next action';
    result.notes = '';
    result.actions = [];
    result.labels = (result.labels || []).map(function (label) { return Object.assign({}, label, { id: uid() }); });
    return result;
  }

  function validationError(message) { throw new Error('Invalid play: ' + message); }
  function object(value, label) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) validationError(label + ' must be an object.');
    return value;
  }
  function text(value, maxLength, label, fallback) {
    if (value === undefined && fallback !== undefined) return fallback;
    if (typeof value !== 'string' || value.length > maxLength || /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(value)) validationError(label + ' must be text of at most ' + maxLength + ' characters.');
    return value;
  }
  function identifier(value, label) {
    var out = text(value, 128, label);
    if (!out || !/^[a-zA-Z0-9_.:-]+$/.test(out)) validationError(label + ' contains unsupported characters.');
    return out;
  }
  function finite(value, label) {
    if (typeof value !== 'number' || !Number.isFinite(value)) validationError(label + ' must be a finite number.');
    return value;
  }
  function list(value, max, label, fallback) {
    if (value === undefined && fallback) return [];
    if (!Array.isArray(value) || value.length > max) validationError(label + ' must contain at most ' + max + ' items.');
    return value;
  }
  function enumeration(value, choices, label) {
    if (choices.indexOf(value) === -1) validationError(label + ' has an unsupported value.');
    return value;
  }

  // Only recognized primitive fields are returned, so imported objects cannot
  // smuggle markup, prototype keys, or other application settings into state.
  function validatePlay(input) {
    object(input, 'play');
    var court = enumeration(input.court, ['half', 'full'], 'court');
    var maxY = HEIGHTS[court] - 30;
    function coordinates(value, label) {
      object(value, label);
      return point(clamp(finite(value.x, label + '.x'), 30, 570), clamp(finite(value.y, label + '.y'), 30, maxY));
    }
    var seenFrames = new Set();
    var frames = list(input.frames, 60, 'frames').map(function (f, index) {
      object(f, 'frame');
      var id = identifier(f.id, 'frame id');
      if (seenFrames.has(id)) validationError('frame ids must be unique.');
      seenFrames.add(id);
      var playerIds = new Set();
      var players = list(f.players, 30, 'players').map(function (p) {
        object(p, 'player');
        var pid = identifier(p.id, 'player id');
        if (playerIds.has(pid)) validationError('player ids within a frame must be unique.');
        playerIds.add(pid);
        return Object.assign({ id: pid, label: text(p.label, 12, 'player label'), team: enumeration(p.team, ['offense', 'defense'], 'team') }, coordinates(p, 'player'));
      });
      function association(value, label) {
        if (value === null || value === undefined) return null;
        var valueId = identifier(value, label);
        if (!playerIds.has(valueId)) validationError(label + ' must reference a player in the frame.');
        return valueId;
      }
      var ballOwner = association(f.ballOwner, 'ball owner');
      var ball = coordinates(f.ball, 'ball');
      if (ballOwner) {
        var holder = players.find(function (p) { return p.id === ballOwner; });
        ball = point(holder.x, holder.y);
      }
      var actionIds = new Set();
      var movedPlayers = new Set();
      var actions = list(f.actions, 100, 'actions', true).map(function (a) {
        object(a, 'action');
        var aid = identifier(a.id, 'action id');
        if (actionIds.has(aid)) validationError('action ids within a frame must be unique.');
        actionIds.add(aid);
        var type = enumeration(a.type, TYPES, 'action type');
        var playerId = association(a.playerId, 'action player');
        var targetId = association(a.targetId, 'action target');
        if (type !== 'pass' && targetId) validationError('only passes may reference a target player.');
        if (type === 'pass' && playerId && playerId === targetId) validationError('a player cannot pass to themselves.');
        if (type !== 'pass' && playerId) {
          if (movedPlayers.has(playerId)) validationError('use one movement per player per frame.');
          movedPlayers.add(playerId);
        }
        return { id: aid, type: type, from: coordinates(a.from, 'action start'), to: coordinates(a.to, 'action end'), playerId: playerId, targetId: targetId };
      });
      var labelIds = new Set();
      var labels = list(f.labels, 50, 'labels', true).map(function (label) {
        object(label, 'label');
        var lid = identifier(label.id, 'label id');
        if (labelIds.has(lid)) validationError('label ids within a frame must be unique.');
        labelIds.add(lid);
        return Object.assign({ id: lid, text: text(label.text, 180, 'label text') }, coordinates(label, 'label'));
      });
      var duration = finite(f.duration, 'frame duration');
      if (duration < 0.3 || duration > 300) validationError('frame duration must be between 0.3 and 300 seconds.');
      var motionDuration = f.motionDuration === undefined ? duration : finite(f.motionDuration, 'motion duration');
      if (motionDuration < 0.3 || motionDuration > duration) validationError('motion duration must be between 0.3 seconds and the step duration.');
      return { id: id, name: text(f.name, 80, 'frame name', 'Step ' + (index + 1)), notes: text(f.notes, 2000, 'coaching notes', ''), duration: duration, motionDuration: motionDuration, players: players, ballOwner: ballOwner, ball: ball, actions: actions, labels: labels };
    });
    if (!frames.length) validationError('at least one frame is required.');
    var updatedAt = text(input.updatedAt, 40, 'updated date', new Date().toISOString());
    if (!Number.isFinite(Date.parse(updatedAt))) validationError('updated date must be a valid date.');
    return { id: identifier(input.id, 'play id'), name: text(input.name, 120, 'play name'), category: enumeration(input.category, ['Offense', 'Defense', 'Inbound'], 'category'), court: court, frames: frames, updatedAt: new Date(updatedAt).toISOString() };
  }

  function addAction(frame, type, label, x, y, targetLabel) {
    var p = frame.players.find(function (item) { return item.label === String(label) && item.team === 'offense'; });
    var target = targetLabel ? frame.players.find(function (item) { return item.label === String(targetLabel) && item.team === 'offense'; }) : null;
    frame.actions.push({ id: uid(), type: type, from: point(p.x, p.y), to: point(x, y), playerId: p.id, targetId: target ? target.id : null });
  }
  function appendStep(play, name, notes, duration) {
    var frame = nextFrame(play.frames[play.frames.length - 1]);
    frame.name = name; frame.notes = notes; frame.duration = duration || 3; frame.motionDuration = frame.duration;
    play.frames.push(frame);
    return frame;
  }
  function starterPlays() {
    var horns = createPlay('horns', 'Horns pick & roll');
    var f = horns.frames[0];
    f.name = 'Set the angle';
    f.notes = '5 comes up to screen for 1. 1 dribbles off the screen toward the right wing. 4 slides out to leave space in the lane; 2 and 3 hold their width.';
    f.duration = 3.5; f.motionDuration = f.duration;
    addAction(f, 'screen', 5, 355, 410);
    addAction(f, 'dribble', 1, 410, 345);
    addAction(f, 'move', 4, 165, 330);
    f = appendStep(horns, 'Roll and deliver', '5 rolls toward the basket. 1 finds the roll with a pass, while 2 lifts to give a safe outlet. Read the defense before forcing the pass.', 3.5);
    addAction(f, 'move', 5, 330, 165);
    addAction(f, 'move', 2, 90, 385);
    addAction(f, 'pass', 1, 330, 165, 5);
    f = appendStep(horns, 'Finish with space', '5 takes the ball toward the rim. 3 stays wide and 1 holds the wing so the lane remains open. Pause here to discuss the finish or kick-out read.', 2.5);
    addAction(f, 'dribble', 5, 305, 125);

    var cut = createPlay('5-out', 'Pass, cut & fill');
    f = cut.frames[0];
    f.name = 'Pass and basket cut';
    f.notes = '1 passes to 3, then cuts hard toward the basket. 2 fills the top spot as the cut opens space. Keep eyes on the ball throughout the cut.';
    f.duration = 4; f.motionDuration = f.duration;
    addAction(f, 'pass', 1, 485, 355, 3);
    addAction(f, 'move', 1, 300, 150);
    addAction(f, 'move', 2, 300, 478);
    f = appendStep(cut, 'Fill the empty spots', '1 exits to the left corner. 4 lifts to the left wing. 3 reverses the ball to 2 at the top; maintain the five outside spots.', 4);
    addAction(f, 'move', 1, 85, 165);
    addAction(f, 'move', 4, 115, 355);
    addAction(f, 'pass', 3, 300, 478, 2);
    f = appendStep(cut, 'Repeat on the other side', '2 passes to 4 and cuts to the rim. 3 fills the top and 5 lifts to the right wing. Use the same pass, cut and fill habit on either side.', 4);
    addAction(f, 'pass', 2, 115, 355, 4);
    addAction(f, 'move', 2, 300, 150);
    addAction(f, 'move', 3, 300, 478);
    addAction(f, 'move', 5, 485, 355);

    var box = createPlay('box', 'Box inbound');
    f = box.frames[0];
    f.name = 'Create two options';
    f.notes = '1 is shown along the baseline as the inbounder. 4 screens across for 2 to cut toward the right block. 5 screens down so 3 can pop to the right wing as the safety option.';
    f.duration = 4; f.motionDuration = f.duration;
    addAction(f, 'screen', 4, 300, 175);
    addAction(f, 'move', 2, 410, 135);
    addAction(f, 'screen', 5, 400, 240);
    addAction(f, 'move', 3, 490, 345);
    f = appendStep(box, 'Make the inbound pass', '1 passes to 2 near the right block. If that option is covered, look to 3 on the wing instead. 4 and 5 clear the middle after screening.', 3);
    addAction(f, 'pass', 1, 410, 135, 2);
    addAction(f, 'move', 4, 200, 290);
    addAction(f, 'move', 5, 380, 290);
    f = appendStep(box, 'Attack and spread', '2 attacks toward the basket. After passing, 1 steps into the right corner; 3 drifts out to keep a clear passing lane.', 2.5);
    addAction(f, 'dribble', 2, 310, 125);
    addAction(f, 'move', 1, 515, 175);
    addAction(f, 'move', 3, 490, 445);
    return [horns, cut, box];
  }

  return {
    WIDTH: WIDTH, HEIGHTS: HEIGHTS, ACTION_TYPES: TYPES.slice(),
    uid: uid, clone: clone, createPlay: createPlay, starterPlays: starterPlays,
    nextFrame: nextFrame, endFrame: endFrame, interpolateFrame: interpolateFrame,
    validatePlay: validatePlay
  };
});
