# TODO

- [x] verify bullet hits on the server
    - [] need to hard code heights of avatars im using so cant get unknown value
    - [] if client is shooting, their bullets should appear for them before confirming they do damage
- [] weapons
    - [x] machine gun
        - [x] reload
            - [x] this needs to be an overheat mechanism instead like halo 3. idk what animation
            - [x] reload timer ui thing above health
    - [x] pick up gun in lobby then you enter arena (can only pick up if adequate balance)
        - [] gun persists through death but is removed on dc
    - [x] drop gun to exit arena
- [] need east / west / eu / etc servers
- [] smoother camera zoom when picking weapon up
- [] slow down players. sprint is too fast for network to handle
    - [] slow down animations as well
- [] F to fire for laptop users
- [] need feedback when getting hit. probably full screen image with like red gradient and transparent in the middle
- [] leaderboard with shots?
- [] cam should follow killer when dead
- [] gun needs to go down a little bit
- [] make coin rigidbody bigger and square cause its being animated
    - [] coins gravitate to player?
- [] enforce ppl not being able to shoot if dead on server
- [] hold X to exit instead of press

# BUGS
- [] player capsule blocks some raycasts when aiming down
    - [] it also continues to overheat the weapon even though no shot happens
    - [] solution i believe is to place the origin of the server raycast in front of the players eyes but outside of the capsule. the capsule will block shooting behind the player
- [] huge lag spikes after server has been running for a while and a player dies
- [] can still create tokens if shooting dead body for a certain amt of time
- 

## Game Rules
- depositing x amount of hyper enables entry
- hyper turns into offchain currency 
- every shot, user drops x hyper
- whoever got the shot in can pick it up
- you get kicked out of the arena when you dont have enough balance

### Hyperfy prompt

Context:
This is a custom javascript scripting environment which is very strict
It is built ontop of three.js but only these variables are directly exposed as globals:
- Vector3
- Quaternion
- Matrix4
It is made up of models, which scripts are inserted into, the combination is referred to as "Apps"
Apps can communicate data with:
- app.send('event', data, skipId (server only))
    - sends data between client and server on same app, can skip client id if on server
- app.on('event' (data)=>{})
    - listens to events from the same app on the client or server
- app.emit('event', data)
    - emits an event to other apps, but only works on the server
- world.on('event', data)
    - listens to data from other apps, but only works on the server
- app.state is sent to clients when they enter world but not sync'd afterwards