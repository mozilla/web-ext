/* @flow */
import parseJSONLib from 'parse-json';

import {InvalidJSON} from '../errors';

export function parseJSON(jsonContents: Object, jsonFile: string) {
  try {
    jsonContents = stripBOM(jsonContents);
  } catch (error) {
    throw new InvalidJSON(
      `Could not read json file at ${jsonFile}: ${error}`);
  }

  return parseJSONLib(jsonContents, jsonFile);
}

function stripBOM(content) {
  content = content.toString();
  if (content.charCodeAt(0) === 0xFEFF) {
    content = content.slice(1);
  }
  return content;
}