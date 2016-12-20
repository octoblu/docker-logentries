# docker-logentries

Forward all your logs to [Logentries](https://logentries.com), like a breeze.

![logentries dashboard](https://raw.githubusercontent.com/nearform/docker-logentries/master/dashboard.png)

See the Logentries community pack at [http://revelops.com/community/packs/docker/](http://revelops.com/community/packs/docker/).

## How it works

This module wraps four [Docker APIs](https://docs.docker.com/reference/api/docker_remote_api_v1.17/):

* `POST /containers/{id}/attach`, to fetch the logs
* `GET /containers/{id}/stats`, to fetch the stats of the container
* `GET /containers/json`, to detect the containers that are running when
  this module starts
* `GET /events`, to detect new containers that will start after the
  module has started

This module wraps
[docker-loghose](https://github.com/mcollina/docker-loghose) and
[docker-stats](https://github.com/pelger/docker-stats) to fetch the logs
and the stats as a never ending stream of data.

All the originating requests are wrapped in a
[never-ending-stream](https://github.com/mcollina/never-ending-stream).

## License

MIT
