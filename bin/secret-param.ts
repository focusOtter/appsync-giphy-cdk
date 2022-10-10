#!/usr/bin/env node
import 'source-map-support/register'
import * as cdk from 'aws-cdk-lib'
import { APIStack } from '../lib/apiStack'

const app = new cdk.App()
new APIStack(app, 'APIStack', {})
