#!/bin/bash

docker stop $(cat gateway.dcid)
rm gateway.dcid
